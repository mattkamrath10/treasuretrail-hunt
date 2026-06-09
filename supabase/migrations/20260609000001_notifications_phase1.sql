-- Notification Restructure — Phase 1
--
-- Adds the reply-to-wanted-post pipeline and channel-aware notification
-- preferences. Idempotent. Does NOT drop any scout / reputation / badge /
-- escalation DDL — those features stay intact; we only stop generating the
-- notification ENTRIES that are no longer part of the strategy (handled in
-- client code, not here).
--
-- Apply in the Supabase SQL editor.

-- 1. wanted_responses ------------------------------------------------------
-- A structured "I have this / here's my response" record for an OPEN wanted
-- post. Carries the message, optional photo URLs, and an optional link to one
-- of the responder's own marketplace listings. The conversation/DM is created
-- separately client-side; this row is what fires the owner's in-app alert.
create table if not exists public.wanted_responses (
  id                uuid primary key default gen_random_uuid(),
  wanted_item_id    uuid not null references public.wanted_items(id) on delete cascade,
  responder_id      uuid not null references auth.users(id) on delete cascade,
  message           text not null check (char_length(message) between 1 and 2000),
  photo_urls        text[] not null default '{}',
  linked_listing_id uuid,
  created_at        timestamptz not null default now()
);

create index if not exists wanted_responses_item_idx
  on public.wanted_responses (wanted_item_id, created_at desc);
create index if not exists wanted_responses_responder_idx
  on public.wanted_responses (responder_id, created_at desc);

alter table public.wanted_responses enable row level security;

-- Responder may insert ONLY when the parent post is open and they are not the
-- owner. auth.uid() is stamped as responder_id.
drop policy if exists wanted_responses_insert on public.wanted_responses;
create policy wanted_responses_insert on public.wanted_responses
  for insert with check (
    auth.uid() = responder_id
    and exists (
      select 1 from public.wanted_items w
      where w.id = wanted_item_id
        and w.status = 'open'
        and w.user_id <> auth.uid()
    )
  );

-- Owner of the parent post and the responder may read responses.
drop policy if exists wanted_responses_select on public.wanted_responses;
create policy wanted_responses_select on public.wanted_responses
  for select using (
    auth.uid() = responder_id
    or exists (
      select 1 from public.wanted_items w
      where w.id = wanted_item_id and w.user_id = auth.uid()
    )
  );

grant select, insert on public.wanted_responses to authenticated;

-- 2. owner alert trigger ---------------------------------------------------
-- AFTER INSERT, drop exactly one `wanted_post_response` notification on the
-- post owner. SECURITY DEFINER so it can write a notification addressed to a
-- different user (RLS on notifications only allows self-addressed inserts).
create or replace function public.notify_wanted_post_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner          uuid;
  v_title          text;
  v_responder_name text;
begin
  select user_id, title into v_owner, v_title
  from public.wanted_items
  where id = new.wanted_item_id;

  -- No owner (deleted post) or self-response → nothing to notify.
  if v_owner is null or v_owner = new.responder_id then
    return new;
  end if;

  select coalesce(nullif(username, ''), 'A hunter') into v_responder_name
  from public.profiles
  where id = new.responder_id;

  insert into public.notifications (
    user_id, type, title, content, actor_user_id,
    related_item_id, related_item_type, metadata
  )
  values (
    v_owner,
    'wanted_post_response',
    'Someone responded to your wanted post',
    coalesce(v_responder_name, 'A hunter') || ' responded to "'
      || coalesce(v_title, 'your wanted post') || '".',
    new.responder_id,
    new.wanted_item_id,
    'wanted_item',
    '{}'::jsonb
  );

  return new;
end;
$$;

drop trigger if exists wanted_responses_notify on public.wanted_responses;
create trigger wanted_responses_notify
  after insert on public.wanted_responses
  for each row execute function public.notify_wanted_post_response();

-- 3. notify_user allow-list — Phase 1 strategy -----------------------------
-- Tighten the cross-user RPC to the kept transactional types. Scout +
-- reputation entries are no longer generated (the client calls were removed),
-- so they drop off the allow-list. wanted_post_response is created by the
-- trigger above (direct definer insert), but we keep it allowed here too for
-- forward-compat. The scout/reputation FEATURES are untouched — only the
-- notification emission stops.
create or replace function public.notify_user(
  p_target uuid,
  p_type text,
  p_title text,
  p_content text DEFAULT '',
  p_related_item_id text DEFAULT NULL,
  p_related_item_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'p_target is required';
  END IF;
  IF p_type NOT IN (
    'follow','message','listing_saved','listing_shared','wanted_post_response'
  ) THEN
    RAISE EXCEPTION 'notification type % is not allowed via notify_user', p_type;
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, content, actor_user_id,
    related_item_id, related_item_type, metadata
  )
  VALUES (
    p_target, p_type, p_title, COALESCE(p_content, ''),
    auth.uid(),
    NULLIF(p_related_item_id, '')::uuid,
    p_related_item_type,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) TO authenticated;

-- 4. notification preferences ---------------------------------------------
-- Channel-aware JSONB so email / sms / push can be enabled later WITHOUT a
-- schema change: { messages: { in_app, email, sms, push }, ... }. Default '{}'
-- means "use built-in defaults" (in-app on, other channels off).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
