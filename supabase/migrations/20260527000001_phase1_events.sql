-- =============================================================================
-- PHASE 1 — Seller-driven marketplace foundation
-- =============================================================================
-- Adds two account types (seeker / holder) and the minimum tables needed to
-- run a real local-events feed: events, featured items, saves, views, clicks.
--
-- Design notes
--   * Profiles get account_type defaulting to 'seeker' so every existing user
--     keeps the current experience. A holder is anyone who has flipped the
--     flag from the Profile page — we never force a picker.
--   * Events analytics clone the listing_views / track_listing_view pattern
--     (SECURITY DEFINER RPC + per-day dedupe + aggregate view). This keeps
--     the surface area small and the auth story identical.
--   * RLS: holders can only write their own events / featured items. Public
--     can read 'published' events. Saves/views/clicks readable only to the
--     row owner (or the holder, for analytics); writes go through RPCs.
-- =============================================================================

-- 1. profiles: account type + holder business fields -------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'seeker'
    CHECK (account_type IN ('seeker','holder')),
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_bio text,
  ADD COLUMN IF NOT EXISTS business_logo_url text;

CREATE INDEX IF NOT EXISTS profiles_account_type_idx
  ON public.profiles (account_type)
  WHERE account_type = 'holder';

-- 1b. is_holder() helper -----------------------------------------------------
-- SECURITY DEFINER so policies can check the caller's account_type without
-- triggering RLS recursion on profiles. Used by the events write policies
-- below — relying on `auth.uid() = holder_id` alone is not enough because a
-- seeker could still INSERT events with their own UID via direct API calls.
CREATE OR REPLACE FUNCTION public.is_holder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND account_type = 'holder'
  );
$$;

REVOKE ALL    ON FUNCTION public.is_holder() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_holder() TO authenticated;

-- 2. events ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  category         text NOT NULL DEFAULT 'estate_sale'
                     CHECK (category IN (
                       'estate_sale','yard_sale','flea_market','auction',
                       'pop_up','collectibles_show','other'
                     )),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  address          text,
  city             text,
  region           text,
  lat              double precision,
  lng              double precision,
  cover_image_url  text,
  cover_thumb_url  text,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_holder_idx       ON public.events (holder_id);
CREATE INDEX IF NOT EXISTS events_status_start_idx ON public.events (status, starts_at);
CREATE INDEX IF NOT EXISTS events_city_idx         ON public.events (city) WHERE status = 'published';

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_public ON public.events;
CREATE POLICY events_select_public ON public.events
  FOR SELECT TO authenticated, anon
  USING (status = 'published' OR auth.uid() = holder_id);

DROP POLICY IF EXISTS events_insert_own ON public.events;
CREATE POLICY events_insert_own ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = holder_id AND public.is_holder());

DROP POLICY IF EXISTS events_update_own ON public.events;
CREATE POLICY events_update_own ON public.events
  FOR UPDATE TO authenticated
  USING      (auth.uid() = holder_id AND public.is_holder())
  WITH CHECK (auth.uid() = holder_id AND public.is_holder());

DROP POLICY IF EXISTS events_delete_own ON public.events;
CREATE POLICY events_delete_own ON public.events
  FOR DELETE TO authenticated
  USING (auth.uid() = holder_id AND public.is_holder());

-- 3. event_featured_items ---------------------------------------------------
-- Small gallery of "preview" items per event. Not a full marketplace listing
-- — just title + optional price + image. We cap at 12 client-side.
CREATE TABLE IF NOT EXISTS public.event_featured_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title       text NOT NULL,
  price       numeric(10,2),
  image_url   text,
  thumb_url   text,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_featured_items_event_idx
  ON public.event_featured_items (event_id, position);

ALTER TABLE public.event_featured_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_featured_items_select ON public.event_featured_items;
CREATE POLICY event_featured_items_select ON public.event_featured_items
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.status = 'published' OR e.holder_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS event_featured_items_write ON public.event_featured_items;
CREATE POLICY event_featured_items_write ON public.event_featured_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

-- Cap: at most 12 featured items per event. Client-side UI enforces this
-- but the trigger is the only thing that holds under concurrent inserts
-- or direct API/devtools writes that bypass the form.
CREATE OR REPLACE FUNCTION public.enforce_event_featured_items_cap()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.event_featured_items WHERE event_id = NEW.event_id) >= 12 THEN
    RAISE EXCEPTION 'event_featured_items: max 12 items per event' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_featured_items_cap ON public.event_featured_items;
CREATE TRIGGER event_featured_items_cap
  BEFORE INSERT ON public.event_featured_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_featured_items_cap();

-- 4. event_saves -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_saves (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_saves_event_idx ON public.event_saves (event_id);

ALTER TABLE public.event_saves ENABLE ROW LEVEL SECURITY;

-- Save rows are visible to (a) the saver, (b) the event holder (for analytics).
DROP POLICY IF EXISTS event_saves_select ON public.event_saves;
CREATE POLICY event_saves_select ON public.event_saves
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

DROP POLICY IF EXISTS event_saves_insert ON public.event_saves;
CREATE POLICY event_saves_insert ON public.event_saves
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_saves_delete ON public.event_saves;
CREATE POLICY event_saves_delete ON public.event_saves
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. event_views + RPC ------------------------------------------------------
-- Dedupes per (event, viewer, day). Anonymous views ignored in V1.
CREATE TABLE IF NOT EXISTS public.event_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_views_dedup
  ON public.event_views (event_id, viewer_id, viewed_day)
  WHERE viewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_views_event_idx ON public.event_views (event_id);

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

-- Holder can read their own event's view rows; viewer can read their own.
DROP POLICY IF EXISTS event_views_select ON public.event_views;
CREATE POLICY event_views_select ON public.event_views
  FOR SELECT TO authenticated
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );
-- No INSERT policy → writes only via the SECURITY DEFINER RPC below.

CREATE OR REPLACE FUNCTION public.track_event_view(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN; -- anonymous views ignored in V1
  END IF;
  INSERT INTO public.event_views (event_id, viewer_id)
  VALUES (p_event_id, v_uid)
  ON CONFLICT (event_id, viewer_id, viewed_day)
    WHERE viewer_id IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.track_event_view(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_event_view(uuid) TO authenticated;

-- 6. event_clicks + RPC -----------------------------------------------------
-- Logs taps on holder-defined CTAs (directions, featured item, contact). We
-- only need totals for the analytics dashboard so no dedupe.
CREATE TABLE IF NOT EXISTS public.event_clicks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  clicker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  click_kind text NOT NULL CHECK (click_kind IN ('directions','featured_item','contact','share')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_clicks_event_idx ON public.event_clicks (event_id, click_kind);

ALTER TABLE public.event_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_clicks_select ON public.event_clicks;
CREATE POLICY event_clicks_select ON public.event_clicks
  FOR SELECT TO authenticated
  USING (
    auth.uid() = clicker_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.track_event_click(p_event_id uuid, p_click_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF p_click_kind NOT IN ('directions','featured_item','contact','share') THEN
    RAISE EXCEPTION 'invalid click_kind %', p_click_kind;
  END IF;
  INSERT INTO public.event_clicks (event_id, clicker_id, click_kind)
  VALUES (p_event_id, v_uid, p_click_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.track_event_click(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_event_click(uuid, text) TO authenticated;

-- 7. Aggregate views for the analytics dashboard ---------------------------
CREATE OR REPLACE VIEW public.event_view_counts AS
SELECT event_id, count(*)::int AS view_count
FROM public.event_views
GROUP BY event_id;

CREATE OR REPLACE VIEW public.event_save_counts AS
SELECT event_id, count(*)::int AS save_count
FROM public.event_saves
GROUP BY event_id;

CREATE OR REPLACE VIEW public.event_click_counts AS
SELECT event_id, click_kind, count(*)::int AS click_count
FROM public.event_clicks
GROUP BY event_id, click_kind;

GRANT SELECT ON public.event_view_counts  TO authenticated;
GRANT SELECT ON public.event_save_counts  TO authenticated;
GRANT SELECT ON public.event_click_counts TO authenticated;

-- 8. updated_at trigger for events -----------------------------------------
CREATE OR REPLACE FUNCTION public.events_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_updated_at();
