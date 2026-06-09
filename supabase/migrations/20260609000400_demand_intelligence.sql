-- ============================================================================
-- Demand Intelligence (Phase 5) — aggregate buyer demand from failed searches
-- and Wanted Requests, queryable by item and by radius bucket.
-- ----------------------------------------------------------------------------
-- Every no-result search and every Wanted Request is folded into an aggregate
-- counter keyed by (normalized term, category, coarse geocell). We never store
-- who searched — only counts and a rounded location — so the seller-facing
-- surface ("N people near you are looking for X") can never expose individuals.
--
-- Writes go through a SECURITY DEFINER RPC (record_search_demand) so the table
-- itself stays locked (RLS on, no policies). Reads go through Pro-gated definer
-- RPCs that mirror the seller-reach entitlement pattern: a free user who
-- hand-crafts an API call gets PRO_REQUIRED, not data.
--
-- All idempotent — safe to run more than once.
--
-- AGENT NOTE: the agent cannot apply Supabase DDL. Apply this by running the
-- migration or pasting the body below into the Supabase SQL editor. Until then,
-- src/lib/demand.ts degrades gracefully (capture is a no-op, reads return
-- empty) so the app keeps working.
-- ============================================================================

-- Great-circle miles helper. Normally created by the wanted-match migration;
-- re-declared here (create or replace) so this migration is self-contained and
-- the radius RPC below works even if applied first.
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

-- ----------------------------------------------------------------------------
-- 1. Aggregate demand table.
--    category '' = unknown; geocell '' = no location. cell_lat/lng hold the
--    rounded representative coordinate used for radius queries. The unique key
--    makes each (term, category, geocell) a single counter row we increment.
-- ----------------------------------------------------------------------------
create table if not exists public.search_demand (
  id                uuid primary key default gen_random_uuid(),
  term              text not null,
  category          text not null default '',
  geocell           text not null default '',
  cell_lat          double precision,
  cell_lng          double precision,
  demand_count      integer not null default 0,
  last_requested_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (term, category, geocell)
);

-- RLS on, NO policies: the table is reachable only through the SECURITY DEFINER
-- RPCs below (which run as the owner and bypass RLS). No direct REST access.
alter table public.search_demand enable row level security;

create index if not exists search_demand_term_idx on public.search_demand (term);
create index if not exists search_demand_cell_idx on public.search_demand (cell_lat, cell_lng);

-- ----------------------------------------------------------------------------
-- 2. Capture RPC. Normalizes the term, rounds the location to a coarse cell
--    (~7 mi at 1 decimal) so individuals can't be pinpointed, and upserts an
--    incrementing counter. Callable by anyone (guests search too).
-- ----------------------------------------------------------------------------
create or replace function public.record_search_demand(
  p_term text,
  p_category text default '',
  p_lat double precision default null,
  p_lng double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term text;
  v_cat  text;
  v_cell text;
  v_clat double precision;
  v_clng double precision;
begin
  -- Normalize: lowercase, collapse whitespace, trim, cap length.
  v_term := lower(btrim(regexp_replace(coalesce(p_term, ''), '\s+', ' ', 'g')));
  if length(v_term) < 2 then
    return; -- ignore empty/1-char noise
  end if;
  v_term := left(v_term, 80);

  v_cat := lower(btrim(coalesce(p_category, '')));
  v_cat := left(v_cat, 40);

  if p_lat is not null and p_lng is not null
     and p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_clat := round(p_lat::numeric, 1);
    v_clng := round(p_lng::numeric, 1);
    v_cell := v_clat::text || '_' || v_clng::text;
  else
    v_cell := '';
    v_clat := null;
    v_clng := null;
  end if;

  insert into public.search_demand (
    term, category, geocell, cell_lat, cell_lng, demand_count, last_requested_at
  )
  values (v_term, v_cat, v_cell, v_clat, v_clng, 1, now())
  on conflict (term, category, geocell) do update
    set demand_count      = public.search_demand.demand_count + 1,
        last_requested_at  = now();
end;
$$;

revoke all on function public.record_search_demand(text, text, double precision, double precision) from public;
grant execute on function public.record_search_demand(text, text, double precision, double precision) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Read RPCs — Pro-gated, aggregate-only (mirrors fetch_seller_reach).
-- ----------------------------------------------------------------------------

-- Top demand by item across all locations.
create or replace function public.fetch_demand_by_item(p_limit int default 20)
returns table (term text, category text, total int, last_requested_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_pro boolean;
begin
  select (membership_tier = 'pro' or coalesce(pro_member, false))
    into v_is_pro
    from public.profiles
   where id = auth.uid();

  if not coalesce(v_is_pro, false) then
    raise exception 'PRO_REQUIRED: demand insights are a Pro feature'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select d.term,
         d.category,
         sum(d.demand_count)::int as total,
         max(d.last_requested_at) as last_requested_at
    from public.search_demand d
   group by d.term, d.category
   order by total desc, max(d.last_requested_at) desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.fetch_demand_by_item(int) from public, anon;
grant execute on function public.fetch_demand_by_item(int) to authenticated;

-- Local demand within a radius of a point. Sums counters whose rounded cell
-- centre falls inside the radius; returns aggregates + the nearest cell
-- distance (never a precise user location).
create or replace function public.fetch_local_demand(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision default 25,
  p_limit int default 20
)
returns table (term text, category text, total int, nearest_miles double precision)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_pro boolean;
begin
  select (membership_tier = 'pro' or coalesce(pro_member, false))
    into v_is_pro
    from public.profiles
   where id = auth.uid();

  if not coalesce(v_is_pro, false) then
    raise exception 'PRO_REQUIRED: demand insights are a Pro feature'
      using errcode = 'insufficient_privilege';
  end if;

  if p_lat is null or p_lng is null then
    return;
  end if;

  return query
  select d.term,
         d.category,
         sum(d.demand_count)::int as total,
         min(public.haversine_miles(p_lat, p_lng, d.cell_lat, d.cell_lng)) as nearest_miles
    from public.search_demand d
   where d.cell_lat is not null
     and d.cell_lng is not null
     and public.haversine_miles(p_lat, p_lng, d.cell_lat, d.cell_lng)
         <= greatest(1, least(coalesce(p_radius_miles, 25), 500))
   group by d.term, d.category
   order by total desc, nearest_miles asc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.fetch_local_demand(double precision, double precision, double precision, int) from public, anon;
grant execute on function public.fetch_local_demand(double precision, double precision, double precision, int) to authenticated;
