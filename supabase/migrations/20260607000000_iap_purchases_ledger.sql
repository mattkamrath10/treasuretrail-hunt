-- =====================================================================
-- IAP purchases ledger
-- ---------------------------------------------------------------------
-- Idempotency + exactly-once accounting for Apple In-App Purchases made via
-- RevenueCat. This table is written ONLY by the service-role server
-- (server/grants.ts); JWT clients have no access (RLS on, no policies).
--
--   * Subscription webhook events are deduped by rc_event_id.
--   * Boost consumables are claimed atomically by rc_transaction_id so one
--     purchased boost can be redeemed against exactly one item.
--
-- Both rc_event_id and rc_transaction_id are UNIQUE but nullable: a row is
-- either a webhook record (rc_event_id set) or a boost claim
-- (rc_transaction_id set). Postgres allows multiple NULLs in a UNIQUE column,
-- so the two row kinds coexist.
-- =====================================================================

create table if not exists public.iap_purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  platform           text,
  kind               text not null check (kind in ('subscription', 'boost')),
  product_id         text,
  event_type         text,
  rc_event_id        text unique,
  rc_transaction_id  text unique,
  target_kind        text,
  target_id          text,
  created_at         timestamptz not null default now()
);

create index if not exists iap_purchases_user_id_idx
  on public.iap_purchases (user_id);

-- Lock the table down: only the service role (which bypasses RLS) may read or
-- write it. No policies are created, so every JWT/anon request is denied.
alter table public.iap_purchases enable row level security;
