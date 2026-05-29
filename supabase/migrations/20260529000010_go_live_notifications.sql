-- ============================================================================
-- Go-Live notifications
-- ----------------------------------------------------------------------------
-- When a seller's *online live* event starts, notify everyone who follows that
-- seller with an in-app notification (type 'go_live'). V1 is in-app only — no
-- push. Liveness in this app is schedule-derived (there is no explicit "Go Live"
-- button), so the notification is fired best-effort from client surfaces that
-- render live events (Discover / Live Hub / Following). To make that safe and
-- spam-proof, ALL the eligibility + dedupe logic lives here, server-side:
--
--   * dedupe / spam prevention: `events.go_live_notified_at` is claimed
--     atomically in a single UPDATE whose WHERE clause is also the full
--     eligibility gate. Concurrent callers race on that one UPDATE and only the
--     first winner inserts notifications — every event fires at most once, ever.
--   * followers only: notifications are inserted strictly for rows in
--     `followers` where following_id = the event's holder.
--   * freshness: only fires within the live window AND within 3h of start, so a
--     viewer opening an old/long-running event never back-fires a stale alert.
--
-- The function is SECURITY DEFINER (like notify_user) so it can write to other
-- users' notification rows, but it cannot be abused to create arbitrary spam:
-- it only ever inserts a single truthful go-live alert per event, to that
-- seller's followers.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS go_live_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_followers_go_live(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   public.events%ROWTYPE;
  v_handle  text;
  v_title   text;
  v_count   integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_event_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Atomically claim the go-live notification for this event. The WHERE clause
  -- is BOTH the eligibility gate and the dedupe (go_live_notified_at IS NULL),
  -- so two concurrent callers cannot both win. If no row is updated the event
  -- is ineligible (not live/published/online/fresh) or already notified.
  UPDATE public.events e
     SET go_live_notified_at = now()
   WHERE e.id = p_event_id
     AND e.go_live_notified_at IS NULL
     AND e.status = 'published'
     AND e.event_kind = 'online'
     AND e.starts_at <= now()
     AND now() < COALESCE(e.ends_at, e.starts_at + interval '2 hours')
     AND now() - e.starts_at <= interval '3 hours'
  RETURNING e.* INTO v_event;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = v_event.holder_id;
  v_title := COALESCE(NULLIF(v_handle, ''), 'A seller you follow') || ' is live now';

  INSERT INTO public.notifications (
    user_id, type, title, content,
    actor_user_id, related_item_id, related_item_type, metadata
  )
  SELECT
    f.follower_id,
    'go_live',
    v_title,
    COALESCE(NULLIF(v_event.title, ''), 'Live event') || ' just started — tap to watch.',
    v_event.holder_id,
    v_event.id::text,
    'event',
    '{}'::jsonb
  FROM public.followers f
  WHERE f.following_id = v_event.holder_id
    AND f.follower_id <> v_event.holder_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_followers_go_live(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_followers_go_live(uuid) TO authenticated;
