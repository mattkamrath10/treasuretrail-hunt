-- Phase 4: Retention, alerts, and user-return systems.
-- Adds saved_searches, event_reminders, and extends notifications with richer fields.

-- ------------------------------------------------------------------
-- 1. Extend notifications table with richer metadata fields.
-- ------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_item_id text,
  ADD COLUMN IF NOT EXISTS related_item_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read_status, created_at DESC);

-- Restore strict owner-only INSERT: a user may only write notifications addressed to themselves.
-- Cross-user notifications (e.g. "@actor followed you") MUST go through the SECURITY DEFINER
-- function `notify_user` defined below, which gates the operation by an allow-list of types.
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications for any user" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Cross-user notification helper. Bypasses RLS but only allows a small whitelist
-- of notification types and always stamps the caller as actor_user_id.
CREATE OR REPLACE FUNCTION public.notify_user(
  p_target uuid,
  p_type text,
  p_title text,
  p_content text DEFAULT '',
  p_related_item_id text DEFAULT NULL,
  p_related_item_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'target required';
  END IF;
  IF p_target = auth.uid() THEN
    -- self-notify is fine, just write it.
    NULL;
  END IF;
  IF p_type NOT IN ('follow','message','scout_response','listing_saved','listing_shared') THEN
    RAISE EXCEPTION 'notification type % is not allowed via notify_user', p_type;
  END IF;
  INSERT INTO notifications (
    user_id, type, title, content,
    actor_user_id, related_item_id, related_item_type, metadata
  ) VALUES (
    p_target, p_type, p_title, COALESCE(p_content, ''),
    auth.uid(), p_related_item_id, p_related_item_type, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- 2. Saved searches.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  keywords text NOT NULL DEFAULT '',
  categories text[] NOT NULL DEFAULT '{}'::text[],
  marketplaces text[] NOT NULL DEFAULT '{}'::text[],
  location_text text NOT NULL DEFAULT '',
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user
  ON saved_searches (user_id, created_at DESC);

DROP POLICY IF EXISTS "Users can read own saved searches" ON saved_searches;
CREATE POLICY "Users can read own saved searches"
  ON saved_searches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own saved searches" ON saved_searches;
CREATE POLICY "Users can create own saved searches"
  ON saved_searches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own saved searches" ON saved_searches;
CREATE POLICY "Users can update own saved searches"
  ON saved_searches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved searches" ON saved_searches;
CREATE POLICY "Users can delete own saved searches"
  ON saved_searches FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 3. Event reminders.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  remind_before_minutes integer NOT NULL DEFAULT 60,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_event_reminders_user
  ON event_reminders (user_id, event_id);

DROP POLICY IF EXISTS "Users can read own reminders" ON event_reminders;
CREATE POLICY "Users can read own reminders"
  ON event_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own reminders" ON event_reminders;
CREATE POLICY "Users can create own reminders"
  ON event_reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reminders" ON event_reminders;
CREATE POLICY "Users can update own reminders"
  ON event_reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reminders" ON event_reminders;
CREATE POLICY "Users can delete own reminders"
  ON event_reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
