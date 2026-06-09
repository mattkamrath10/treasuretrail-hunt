-- Local-First Search (Phase 3) — geographic data for distance-aware search.
--
-- Adds nullable coordinates to marketplace listings and wanted items, plus a
-- per-request travel radius on wanted items. All idempotent so it is safe to
-- run more than once. The app reads these via `select('*')` (so a missing
-- column simply yields `undefined`) and strips them from inserts on a 42703,
-- so the app keeps working before this migration is applied — applying it
-- turns on distance sorting, the "N miles away" labels, and travel prefs.

-- Coordinates resolved from the listing's general_location (geocode-on-write
-- + a one-off backfill script). NULL = not yet geocoded / unresolvable.
alter table if exists public.marketplace_listings
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Coordinates resolved from the wanted request's city/region, plus how far the
-- requester is willing to travel (miles). NULL travel_distance = "Anywhere".
alter table if exists public.wanted_items
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists travel_distance integer;

-- Helpful (optional) indexes for future radius queries. Cheap, idempotent.
create index if not exists marketplace_listings_lat_lng_idx
  on public.marketplace_listings (lat, lng);
create index if not exists wanted_items_lat_lng_idx
  on public.wanted_items (lat, lng);
