-- Phase 1 — Monetization Foundation
-- Adds boost columns + lightweight moderation columns to every public
-- content table, plus a single analytics_events firehose. No Stripe
-- integration yet — payment flow is mocked in src/lib/payments.ts and
-- writes these columns directly on "purchase" success.
--
-- Boost columns:
--   boosted_at         when the boost was activated
--   boost_expires_at   when the boost stops counting toward priority
--   boost_type         'paid' (one-off $3) or 'pro' (included w/ Pro)
--   priority_score     int hint for ranking (0 = none). Computed in app,
--                      stored so backend ORDER BY stays cheap.
--
-- Moderation columns (lightweight; no admin dashboard yet):
--   is_hidden          hard-hide from public reads (admin or self-report)
--   report_count       running tally so feeds can de-rank noisy posts
--
-- All columns are nullable / default-safe so existing rows keep working
-- without backfill. Public-read RLS already filters by status/etc.;
-- application-level fetchers add `.eq('is_hidden', false)` on top.

-- ---------- boost + moderation columns ------------------------------
alter table public.events
  add column if not exists boosted_at        timestamptz,
  add column if not exists boost_expires_at  timestamptz,
  add column if not exists boost_type        text check (boost_type in ('paid','pro')),
  add column if not exists priority_score    int not null default 0,
  add column if not exists is_hidden         boolean not null default false,
  add column if not exists report_count      int not null default 0;

alter table public.wanted_items
  add column if not exists boosted_at        timestamptz,
  add column if not exists boost_expires_at  timestamptz,
  add column if not exists boost_type        text check (boost_type in ('paid','pro')),
  add column if not exists priority_score    int not null default 0,
  add column if not exists is_hidden         boolean not null default false,
  add column if not exists report_count      int not null default 0;

alter table public.community_posts
  add column if not exists boosted_at        timestamptz,
  add column if not exists boost_expires_at  timestamptz,
  add column if not exists boost_type        text check (boost_type in ('paid','pro')),
  add column if not exists priority_score    int not null default 0,
  add column if not exists is_hidden         boolean not null default false,
  add column if not exists report_count      int not null default 0;

alter table public.marketplace_listings
  add column if not exists boosted_at        timestamptz,
  add column if not exists boost_expires_at  timestamptz,
  add column if not exists boost_type        text check (boost_type in ('paid','pro')),
  add column if not exists priority_score    int not null default 0,
  add column if not exists is_hidden         boolean not null default false,
  add column if not exists report_count      int not null default 0;

-- Partial indexes: only rows with an active boost matter for ranking;
-- 99% of the table will be NULL, so the index stays tiny.
create index if not exists events_active_boost_idx
  on public.events (boost_expires_at desc)
  where boost_expires_at is not null;

create index if not exists wanted_items_active_boost_idx
  on public.wanted_items (boost_expires_at desc)
  where boost_expires_at is not null;

create index if not exists community_posts_active_boost_idx
  on public.community_posts (boost_expires_at desc)
  where boost_expires_at is not null;

create index if not exists marketplace_listings_active_boost_idx
  on public.marketplace_listings (boost_expires_at desc)
  where boost_expires_at is not null;

-- ---------- analytics_events firehose ------------------------------
-- One thin row per tracked interaction. We deliberately do NOT shard
-- by target type — a single table is cheaper to query and keeps the
-- monetization analytics surface honest (no hidden per-type tables).
-- Tracked kinds: 'view', 'click', 'message_started', 'save', 'profile_visit'.
-- Target kinds:  'event', 'wanted', 'find', 'listing', 'profile'.
create table if not exists public.analytics_events (
  id           bigserial primary key,
  kind         text not null
               check (kind in ('view','click','message_started','save','profile_visit')),
  actor_id     uuid references auth.users(id) on delete set null,
  target_kind  text not null
               check (target_kind in ('event','wanted','find','listing','profile')),
  target_id    uuid not null,
  created_at   timestamptz not null default now()
);

create index if not exists analytics_events_target_idx
  on public.analytics_events (target_kind, target_id, created_at desc);
create index if not exists analytics_events_actor_idx
  on public.analytics_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.analytics_events enable row level security;

-- Anyone (including anon) can insert their own events — view tracking
-- must work without an account. We accept that this is best-effort and
-- spammable; aggregate analytics will sanity-check counts later.
drop policy if exists analytics_events_insert_anyone on public.analytics_events;
create policy analytics_events_insert_anyone on public.analytics_events
  for insert with check (
    actor_id is null or auth.uid() = actor_id
  );

-- Only the target owner can read their own analytics. Cross-table
-- ownership checks are deferred to Phase 2 (per-target views); for now
-- we lock reads down so the raw firehose is never publicly exposed.
drop policy if exists analytics_events_read_self on public.analytics_events;
create policy analytics_events_read_self on public.analytics_events
  for select using (auth.uid() = actor_id);

grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;
grant usage, select on sequence public.analytics_events_id_seq to anon, authenticated;
