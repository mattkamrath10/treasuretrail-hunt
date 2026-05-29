-- ============================================================================
-- Push notifications (native iOS/Android via Capacitor + Firebase Cloud Messaging)
-- ----------------------------------------------------------------------------
-- Phase 2 of go-live notifications: in addition to the in-app notification
-- (see 20260529000010_go_live_notifications.sql), followers of a seller who
-- starts an online live event also receive a native push.
--
--   * device_tokens: one row per device push token, owned by the user. Tokens
--     are FCM registration tokens (NOT phone numbers). A token is globally
--     unique; if the same device re-registers under a different account the
--     row is reassigned to the new owner (ON CONFLICT (token)).
--   * events.go_live_pushed_at: independent atomic-claim column so the push
--     fan-out (a server-side operation that can fail/retry on its own) dedupes
--     separately from the in-app notification's go_live_notified_at. Same
--     "claim in one UPDATE whose WHERE is also the eligibility gate" pattern.
--
-- RLS: a user may only see/insert/update/delete their OWN device tokens. The
-- server reads tokens across users via the service-role key (bypasses RLS) to
-- fan out a push — there is no client path that can read another user's token.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL DEFAULT 'unknown'
                CHECK (platform IN ('ios', 'android', 'web', 'unknown')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx
  ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
CREATE POLICY "device_tokens_select_own" ON public.device_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
CREATE POLICY "device_tokens_insert_own" ON public.device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
CREATE POLICY "device_tokens_update_own" ON public.device_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_delete_own" ON public.device_tokens;
CREATE POLICY "device_tokens_delete_own" ON public.device_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Independent dedupe column for the push fan-out.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS go_live_pushed_at timestamptz;
