-- =============================================================================
-- Optional Event URL — external event page link
-- =============================================================================
-- Lets hosts attach a single external event page (Facebook event, estate-sale
-- website, HiBid auction, Whatnot stream, etc) to any event WITHOUT pasting the
-- link into the description. The EventDetail page renders a dedicated
-- "Event Website → Visit Event Page" button that opens it in a new tab.
--
-- Design notes
--   * Nullable + no default → every existing event keeps working unchanged.
--   * Applies to BOTH local and online events (independent of livestream_url).
--   * CHECK enforces http(s) only — defense in depth; the form also validates
--     client-side. Keeps javascript:/data: and other schemes out of the table.
--   * No RLS changes — existing holder_id / status policies are unchanged.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_url text;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_event_url_chk;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_url_chk CHECK (
    event_url IS NULL
    OR event_url ~* '^https?://'
  );
