-- =============================================================================
-- PHASE 2 — Business Featured Items
-- =============================================================================
-- Adds a `business_featured_items` table so a business on the Treasure Map can
-- showcase a small gallery of featured inventory (photo, title, description,
-- price, category, availability) on its profile, the map overlay card, and in
-- search — mirroring the existing `event_featured_items` table.
--
-- Design notes
--   * Mirrors `event_featured_items`: parent FK with ON DELETE CASCADE, image +
--     thumb columns, position ordering, and a per-parent cap enforced by a
--     BEFORE INSERT trigger (the only thing that holds under concurrent or
--     direct API/devtools writes that bypass the form).
--   * Adds three fields beyond the event version: `description`, `category`,
--     and `availability` (available / sold / unavailable).
--   * RLS: public reads items whose parent business is published (or the
--     owner's own draft/cancelled rows); only the business owner may write.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.business_featured_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price         numeric(10,2),
  category      text,
  availability  text NOT NULL DEFAULT 'available'
                  CHECK (availability IN ('available','sold','unavailable')),
  image_url     text,
  thumb_url     text,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_featured_items_business_idx
  ON public.business_featured_items (business_id, position);

ALTER TABLE public.business_featured_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_featured_items_select ON public.business_featured_items;
CREATE POLICY business_featured_items_select ON public.business_featured_items
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND (b.status = 'published' OR b.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS business_featured_items_write ON public.business_featured_items;
CREATE POLICY business_featured_items_write ON public.business_featured_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  );

-- Cap: at most 12 featured items per business. The client UI enforces this too,
-- but the trigger is the only guard that holds under concurrent inserts or
-- direct API writes that bypass the form.
CREATE OR REPLACE FUNCTION public.enforce_business_featured_items_cap()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.business_featured_items WHERE business_id = NEW.business_id) >= 12 THEN
    RAISE EXCEPTION 'business_featured_items: max 12 items per business' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_featured_items_cap ON public.business_featured_items;
CREATE TRIGGER business_featured_items_cap
  BEFORE INSERT ON public.business_featured_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_featured_items_cap();
