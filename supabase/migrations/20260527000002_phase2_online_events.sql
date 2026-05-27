-- =============================================================================
-- PHASE 2 — Online live commerce event support
-- =============================================================================
-- Adds support for promoting external live shows (Whatnot, Poshmark Live,
-- Posh Parties, eBay Live) alongside existing local resale events.
--
-- TreasureTrail is a discovery/promotion surface — it does NOT host video,
-- chat, or payments. The new columns just capture the platform + external
-- URL + seller handle so the EventDetail page can render a "Join Live Show"
-- CTA that opens the host's stream on the relevant platform.
--
-- Design notes
--   * `event_kind` is the discriminator: 'local' (existing behavior) vs
--     'online'. Default is 'local' so every Phase 1 row keeps working.
--   * Online events require platform + livestream_url; local events must
--     not have either. Enforced by a single CHECK so the DB protects the
--     UI from accidental half-states.
--   * URL allowlist is enforced at the DB level (regex CHECK) per platform.
--     'other' falls back to https:// only. Defense in depth — the form
--     also validates client-side.
--   * No RLS changes — existing policies key on holder_id / status which
--     are unchanged.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_kind     text NOT NULL DEFAULT 'local'
    CHECK (event_kind IN ('local','online')),
  ADD COLUMN IF NOT EXISTS platform       text
    CHECK (platform IS NULL OR platform IN (
      'whatnot','poshmark_live','posh_party','ebay_live','other'
    )),
  ADD COLUMN IF NOT EXISTS livestream_url text,
  ADD COLUMN IF NOT EXISTS seller_handle  text,
  ADD COLUMN IF NOT EXISTS show_category  text
    CHECK (show_category IS NULL OR show_category IN (
      'sneakers','sportscards','tradingcards','coins','jewelry',
      'vintage','collectibles','fashion','toys','art','other'
    ));

-- Shape integrity: local events have no platform/url; online events must
-- have both. seller_handle and show_category are optional in both modes.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_kind_shape_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_kind_shape_chk CHECK (
    (event_kind = 'local'
      AND platform       IS NULL
      AND livestream_url IS NULL)
    OR
    (event_kind = 'online'
      AND platform       IS NOT NULL
      AND livestream_url IS NOT NULL)
  );

-- Per-platform URL allowlist (case-insensitive).
-- Keeps malicious / phishing URLs out of the table without trusting the UI.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_livestream_url_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_livestream_url_chk CHECK (
    livestream_url IS NULL
    OR (
      CASE platform
        WHEN 'whatnot'       THEN livestream_url ~* '^https://(www\.)?whatnot\.com/'
        WHEN 'poshmark_live' THEN livestream_url ~* '^https://(www\.)?(poshmark\.com|posh\.mk)/'
        WHEN 'posh_party'    THEN livestream_url ~* '^https://(www\.)?(poshmark\.com|posh\.mk)/'
        WHEN 'ebay_live'     THEN livestream_url ~* '^https://(www\.)?ebay\.com/'
        WHEN 'other'         THEN livestream_url ~* '^https://'
        ELSE false
      END
    )
  );

-- seller_handle must be a simple handle (no URLs, no whitespace). Optional.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_seller_handle_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_seller_handle_chk CHECK (
    seller_handle IS NULL
    OR seller_handle ~ '^@?[A-Za-z0-9_.-]{1,40}$'
  );

-- Index for the "Online Live Shows" filter on the public feed.
CREATE INDEX IF NOT EXISTS events_kind_starts_idx
  ON public.events (event_kind, starts_at)
  WHERE status = 'published';

-- Extend event_clicks.click_kind enum + RPC validation to track outbound
-- clicks to external livestream URLs. Phase 1 enum was the 4 local kinds;
-- 'livestream' is the only Phase 2 addition.
ALTER TABLE public.event_clicks
  DROP CONSTRAINT IF EXISTS event_clicks_click_kind_check;

ALTER TABLE public.event_clicks
  ADD CONSTRAINT event_clicks_click_kind_check
  CHECK (click_kind IN ('directions','featured_item','contact','share','livestream'));

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
  IF p_click_kind NOT IN ('directions','featured_item','contact','share','livestream') THEN
    RAISE EXCEPTION 'invalid click_kind %', p_click_kind;
  END IF;
  INSERT INTO public.event_clicks (event_id, clicker_id, click_kind)
  VALUES (p_event_id, v_uid, p_click_kind);
END;
$$;
