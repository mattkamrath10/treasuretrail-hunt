-- Wanted Match Notifications — Phase 4
-- ----------------------------------------------------------------------------
-- When a new marketplace listing is created, notify every user who has an OPEN
-- Wanted Request that matches it — exactly once, ranked local-first.
--
-- Architecture (mirrors the go-live atomic-claim pattern in
-- 20260529000010_go_live_notifications.sql):
--   * The matcher is a SECURITY DEFINER AFTER INSERT trigger on
--     marketplace_listings, so it fires reliably no matter which client created
--     the listing and can write notifications addressed to OTHER users (RLS on
--     notifications only permits self-addressed inserts).
--   * Exactly-once delivery: a (listing_id, wanted_item_id) row is claimed in
--     `wanted_match_notifications` via INSERT ... ON CONFLICT DO NOTHING
--     RETURNING. Only newly-claimed pairs produce a notification, so re-runs /
--     concurrency can never duplicate. Dedup is per WANTED REQUEST (the spec is
--     "one notification per matching Wanted Request"), so a user with two
--     distinct open requests that both match gets one alert per request — each
--     references its own request title and is independently actionable.
--   * Recipients are derived strictly server-side from wanted_items; no client
--     input is trusted.
--   * Conservative matching to avoid spam: the OPEN wanted post's title (>= 3
--     chars) must appear as a substring of the listing title or description,
--     and the requester cannot be the seller.
--   * Distance ranking via stored coordinates + the requester's travel radius:
--       in_radius     🔥 listed N miles away (within travel_distance, or Anywhere)
--       out_of_radius 🔥 listed N miles away (has coords but outside radius)
--       shipping      📦 available with shipping (no coordinates to compare)
--   * Honors the recipient's in-app preference for the "Wanted Item Matches"
--     category (profiles.notification_prefs); default ON when unset.
--
-- The whole matcher is wrapped in an exception guard so a notification failure
-- can NEVER roll back / block the listing insert itself.
--
-- Apply in the Supabase SQL editor.

-- 0. Safety: ensure the notification_prefs column exists (added in
--    20260609000001_notifications_phase1.sql) so the pref gate below never
--    errors even if migrations are applied out of order.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- 1. Distance helper (great-circle miles). Returns NULL when any coordinate is
--    missing, which the matcher treats as the "shipping" bucket.
create or replace function public.haversine_miles(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 3958.7613 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2))
        * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;

-- 1b. Escape LIKE/ILIKE wildcards in user-supplied text so a wanted title like
--     "%%%" or "a_c" can't turn the substring match into a match-everything
--     pattern (notification spam). Paired with `ESCAPE '\'` at the call site.
create or replace function public.like_escape(p text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- 2. Exactly-once dedup ledger. One row per (listing, wanted_item) pair; the
--    primary key is the dedup guard. Written ONLY by the SECURITY DEFINER
--    trigger below (which runs as the table owner and bypasses RLS by
--    ownership); RLS is enabled with NO policies so no client can read/write it.
create table if not exists public.wanted_match_notifications (
  listing_id     uuid not null references public.marketplace_listings(id) on delete cascade,
  wanted_item_id uuid not null references public.wanted_items(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (listing_id, wanted_item_id)
);

alter table public.wanted_match_notifications enable row level security;

-- 3. Matcher trigger function.
create or replace function public.notify_wanted_item_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire for live listings.
  if new.status is distinct from 'active' then
    return new;
  end if;

  -- Best-effort: a failure here must NEVER abort the listing insert.
  begin
    with matches as (
      select
        w.id              as wanted_item_id,
        w.user_id         as recipient,
        w.title           as wtitle,
        w.travel_distance as radius,
        public.haversine_miles(new.lat, new.lng, w.lat, w.lng) as dist
      from public.wanted_items w
      join public.profiles p on p.id = w.user_id
      where w.status = 'open'
        and w.user_id <> new.seller_id
        and char_length(trim(w.title)) >= 3
        -- Conservative substring match with wildcards ESCAPEd so user text can't
        -- broaden the pattern (see like_escape above).
        and (
          new.title ilike '%' || public.like_escape(w.title) || '%' escape '\'
          or coalesce(new.description, '') ilike '%' || public.like_escape(w.title) || '%' escape '\'
        )
        -- Respect the recipient's in-app pref for "Wanted Item Matches".
        -- Only suppress when the stored value is an explicit boolean false;
        -- a missing or malformed value defaults to ON (and never raises a cast
        -- error that would drop the whole fanout).
        and (
          case
            when jsonb_typeof(p.notification_prefs #> '{wanted_item_matches,in_app}') = 'boolean'
              then (p.notification_prefs #>> '{wanted_item_matches,in_app}')::boolean
            else true
          end
        )
    ),
    claimed as (
      insert into public.wanted_match_notifications (listing_id, wanted_item_id)
      select new.id, m.wanted_item_id from matches m
      on conflict (listing_id, wanted_item_id) do nothing
      returning wanted_item_id
    )
    insert into public.notifications (
      user_id, type, title, content,
      actor_user_id, related_item_id, related_item_type, metadata
    )
    select
      m.recipient,
      'wanted_item_match',
      case when m.dist is null then '📦 New match available'
           else '🔥 New match nearby' end,
      case
        when m.dist is null then
          'A listing matching "' || m.wtitle || '" is available with shipping.'
        when round(m.dist) <= 1 then
          'A listing matching "' || m.wtitle || '" was listed 1 mile away.'
        else
          'A listing matching "' || m.wtitle || '" was listed '
            || round(m.dist)::int::text || ' miles away.'
      end,
      new.seller_id,
      new.id::text,
      'listing',
      jsonb_build_object(
        'wanted_item_id', m.wanted_item_id,
        'distance_miles', m.dist,
        'bucket', case
          when m.dist is null then 'shipping'
          when m.radius is null or m.dist <= m.radius then 'in_radius'
          else 'out_of_radius'
        end
      )
    from matches m
    join claimed c on c.wanted_item_id = m.wanted_item_id;
  exception when others then
    raise warning 'notify_wanted_item_matches failed for listing %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists marketplace_listings_wanted_match on public.marketplace_listings;
create trigger marketplace_listings_wanted_match
  after insert on public.marketplace_listings
  for each row execute function public.notify_wanted_item_matches();
