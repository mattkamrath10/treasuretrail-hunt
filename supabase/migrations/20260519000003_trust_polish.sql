-- =============================================================
-- PHASE 9 — Trust, Retention, Polish
-- =============================================================
-- Adds the platform-quality groundwork:
--   * scout_applications  — users applying for the Verified Scout badge
--   * user_blocks         — one user hides another from feeds/messages
--   * listing_views       — per-(user OR ip) per-day deduped view rows
--   * track_listing_view  — RPC: dedupes & upserts a view row
--   * helper engagement view + counter helpers
--
-- Everything is RLS-gated. Admin overrides go through `is_admin()`.
-- =============================================================

-- 1. scout_applications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scout_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','declined','withdrawn')),
  pitch         text DEFAULT '' CHECK (char_length(pitch) <= 2000),
  region        text DEFAULT '',
  specialties   text[] DEFAULT '{}',
  reviewer_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text DEFAULT '' CHECK (char_length(reviewer_note) <= 2000),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- One open application at a time per user. Closed (declined/withdrawn) rows
-- are kept for audit and don't block a fresh submission.
CREATE UNIQUE INDEX IF NOT EXISTS scout_applications_one_open
  ON public.scout_applications (applicant_id)
  WHERE status IN ('pending','approved');

ALTER TABLE public.scout_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_apps_select ON public.scout_applications;
CREATE POLICY scout_apps_select ON public.scout_applications
  FOR SELECT TO authenticated
  USING (auth.uid() = applicant_id OR public.is_admin());

DROP POLICY IF EXISTS scout_apps_insert ON public.scout_applications;
CREATE POLICY scout_apps_insert ON public.scout_applications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS scout_apps_update ON public.scout_applications;
DROP POLICY IF EXISTS scout_apps_update_self ON public.scout_applications;
DROP POLICY IF EXISTS scout_apps_update_admin ON public.scout_applications;

-- Applicant: may edit their own *pending* row, and may only transition
-- it to `withdrawn`. They cannot self-promote to `approved` (the trigger
-- below also defends against this independent of the policy).
CREATE POLICY scout_apps_update_self ON public.scout_applications
  FOR UPDATE TO authenticated
  USING (auth.uid() = applicant_id AND status = 'pending')
  WITH CHECK (
    auth.uid() = applicant_id
    AND status IN ('pending','withdrawn')
  );

-- Admin: full review surface (status, reviewer_id, reviewer_note).
CREATE POLICY scout_apps_update_admin ON public.scout_applications
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Defense in depth: even if a future policy change widens the UPDATE
-- surface by mistake, this BEFORE UPDATE trigger rejects forbidden
-- transitions for non-admin callers. Admins go through unchanged.
CREATE OR REPLACE FUNCTION public.guard_scout_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin path: only the applicant may touch their own row, and
  -- only while it is pending. They may set status to `withdrawn` and
  -- nothing else; reviewer_* columns are off-limits.
  IF auth.uid() IS DISTINCT FROM OLD.applicant_id THEN
    RAISE EXCEPTION 'scout_applications: not your application';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'scout_applications: row is closed';
  END IF;
  IF NEW.status NOT IN ('pending','withdrawn') THEN
    RAISE EXCEPTION 'scout_applications: applicants may only withdraw';
  END IF;
  IF NEW.reviewer_id    IS DISTINCT FROM OLD.reviewer_id
  OR NEW.reviewer_note  IS DISTINCT FROM OLD.reviewer_note
  OR NEW.applicant_id   IS DISTINCT FROM OLD.applicant_id THEN
    RAISE EXCEPTION 'scout_applications: forbidden column change';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_guard ON public.scout_applications;
CREATE TRIGGER scout_apps_guard
  BEFORE UPDATE ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_scout_application_update();

-- 2. user_blocks -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_distinct CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx
  ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select ON public.user_blocks;
CREATE POLICY user_blocks_select ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id OR public.is_admin());

DROP POLICY IF EXISTS user_blocks_insert ON public.user_blocks;
CREATE POLICY user_blocks_insert ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete ON public.user_blocks;
CREATE POLICY user_blocks_delete ON public.user_blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- 3. listing_views ---------------------------------------------------------
-- We dedupe per (listing, kind, viewer_id, viewed_day) so refresh-spam
-- doesn't inflate counts. Anonymous viewers don't write rows in V1.
CREATE TABLE IF NOT EXISTS public.listing_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL,
  listing_kind  text NOT NULL
                  CHECK (listing_kind IN ('marketplace','community_post','external_listing')),
  viewer_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_day    date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_views_dedup
  ON public.listing_views (listing_id, listing_kind, viewer_id, viewed_day)
  WHERE viewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS listing_views_listing_idx
  ON public.listing_views (listing_kind, listing_id);

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

-- Reads: anyone signed in can read counts via aggregate queries; row-level
-- access stays restricted to the viewer themselves + admins.
DROP POLICY IF EXISTS listing_views_select ON public.listing_views;
CREATE POLICY listing_views_select ON public.listing_views
  FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id OR public.is_admin());

-- Direct inserts are blocked — all writes flow through `track_listing_view`,
-- which is SECURITY DEFINER and enforces dedup + admin-bypass safely.
-- (No INSERT policy => deny by default.)

-- 4. track_listing_view RPC -----------------------------------------------
CREATE OR REPLACE FUNCTION public.track_listing_view(
  p_listing_id   uuid,
  p_listing_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- Anonymous views are ignored in V1.
    RETURN;
  END IF;
  IF p_listing_kind NOT IN ('marketplace','community_post','external_listing') THEN
    RAISE EXCEPTION 'invalid listing_kind %', p_listing_kind;
  END IF;

  INSERT INTO public.listing_views (listing_id, listing_kind, viewer_id)
  VALUES (p_listing_id, p_listing_kind, v_uid)
  ON CONFLICT (listing_id, listing_kind, viewer_id, viewed_day)
    WHERE viewer_id IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.track_listing_view(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_listing_view(uuid, text) TO authenticated;

-- 5. listing_view_counts view ---------------------------------------------
-- Exposes a deduped count per listing for use by `select` on the frontend.
CREATE OR REPLACE VIEW public.listing_view_counts AS
SELECT
  listing_id,
  listing_kind,
  count(*)::int AS view_count
FROM public.listing_views
GROUP BY listing_id, listing_kind;

GRANT SELECT ON public.listing_view_counts TO authenticated;

-- 6. listing_save_counts view ---------------------------------------------
-- Mirror for saved_listings so the detail page can render "N saves" without
-- granting broad SELECT on saved_listings.
CREATE OR REPLACE VIEW public.listing_save_counts AS
SELECT
  listing_id,
  listing_kind,
  count(*)::int AS save_count
FROM public.saved_listings
GROUP BY listing_id, listing_kind;

GRANT SELECT ON public.listing_save_counts TO authenticated;

-- 7. notify_user allow-list expansion -------------------------------------
-- The PHASE 8 RPC only allowed (follow, message, scout_response,
-- listing_saved, listing_shared). PHASE 9 adds:
--   * scout_request         — seller is told a scout has been requested
--   * scout_application     — admin notification when a user applies
--   * reputation_milestone  — first listing, first sale, etc.
CREATE OR REPLACE FUNCTION public.notify_user(
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
    'follow','message','scout_response','listing_saved','listing_shared',
    'scout_request','scout_application','reputation_milestone'
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

-- 8. updated_at trigger for scout_applications ----------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_touch ON public.scout_applications;
CREATE TRIGGER scout_apps_touch
  BEFORE UPDATE ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9. Auto-approve trigger: when admin sets status='approved', flip the
--    profiles.scout_verified flag. Keeps the badge source-of-truth on
--    profiles (which feeds.* already join) while letting moderation live
--    in scout_applications.
CREATE OR REPLACE FUNCTION public.apply_scout_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles
       SET scout_verified = true
     WHERE id = NEW.applicant_id;
  ELSIF NEW.status IN ('declined','withdrawn')
        AND OLD.status = 'approved' THEN
    UPDATE public.profiles
       SET scout_verified = false
     WHERE id = NEW.applicant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_sync_profile ON public.scout_applications;
CREATE TRIGGER scout_apps_sync_profile
  AFTER UPDATE OF status ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.apply_scout_verification();
