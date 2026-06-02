-- =============================================================
-- Apple App Store compliance — User-Generated Content (Guideline 1.2)
--
-- Adds the moderation backbone required by Apple App Review:
--   * content_reports  — unified "flag objectionable content" table covering
--                        every UGC surface (listing, find, event, live_event,
--                        profile, comment, message). Users insert their own
--                        reports; admins read + resolve them.
--   * profiles.tos_accepted_at — timestamp recording that a user accepted the
--                        Terms of Service + Community Guidelines at signup.
--
-- Blocking (user_blocks) and listing-specific reports (listing_reports) already
-- exist from earlier migrations and are unchanged.
--
-- RLS uses the existing public.is_admin() helper for moderator access.
--
-- MANUAL APPLY: run this in the Supabase SQL editor (the agent cannot apply
-- DDL). Idempotent — safe to re-run.
-- =============================================================

-- 1. content_reports --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type     text NOT NULL CHECK (content_type IN
                     ('listing','find','event','live_event','profile','comment','message')),
  content_id       text NOT NULL,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category         text NOT NULL,
  details          text DEFAULT '' CHECK (char_length(details) <= 1000),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','reviewing','actioned','dismissed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolver_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_reports_status_idx
  ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx
  ON public.content_reports (reporter_id);
CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON public.content_reports (content_type, content_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Users file their own reports.
DROP POLICY IF EXISTS content_reports_insert ON public.content_reports;
CREATE POLICY content_reports_insert ON public.content_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Reporters see their own reports; admins (moderators) see all.
DROP POLICY IF EXISTS content_reports_select ON public.content_reports;
CREATE POLICY content_reports_select ON public.content_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_admin());

-- Only admins can resolve/triage reports.
DROP POLICY IF EXISTS content_reports_update ON public.content_reports;
CREATE POLICY content_reports_update ON public.content_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. profiles.tos_accepted_at ----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;
