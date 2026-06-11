-- ============================================================================
-- Push notification fan-out — Phase 1 (transactional events)
-- ----------------------------------------------------------------------------
-- Extends native push (FCM) beyond go-live to the existing transactional
-- in-app notifications: new messages, wanted-post responses, new followers,
-- and listing activity (saved/shared).
--
-- Design mirrors the go-live push (see 20260529000020_push_notifications.sql):
-- a single atomic-claim column dedupes the fan-out so a push is delivered at
-- most once per notification, no matter how many times the (best-effort) client
-- trigger fires. Here the claim lives on the NOTIFICATION row itself — every
-- pushable event already lands exactly one `public.notifications` row (the
-- message notification is now created alongside the DM), so the server claims
-- `notifications.pushed_at` in one UPDATE whose WHERE is also the gate
-- (id matches AND pushed_at IS NULL), then fans the push out to the recipient's
-- device tokens.
--
-- Degrades quietly: if this column is missing the server's claim returns 42703
-- and push no-ops, so the app keeps working pre-migration.
--
-- Apply in the Supabase SQL editor.
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- Partial index for the claim lookup: "latest unpushed notification authored by
-- this actor of this type". Only indexes rows still eligible for a push.
CREATE INDEX IF NOT EXISTS notifications_push_claim_idx
  ON public.notifications (actor_user_id, type, created_at DESC)
  WHERE pushed_at IS NULL;
