/*
  # Listings logistics, safety & scout coordination

  Adds the structured fields that power TreasureTrail's reseller-friendly
  upload forms, item detail pages, filters, and scout coordination — across
  `community_posts` (Flash Finds), `marketplace_listings` (in-app store), and
  `external_listings` (Auctions / Live / Estate / Yard / etc.).

  New columns (idempotent, default-safe so existing rows keep working):

    general_location        text   — required-at-form-layer ZIP or "City, ST"
    exact_address_private   text   — optional precise pickup address; treated
                                     as PRIVATE: the app never selects this
                                     column in public reads. Owner-only fetch
                                     via `get_my_exact_address(...)` RPC.
    pickup_type             text[] — multi-select badges: local_pickup,
                                     shipping_available, meetup_only,
                                     scout_delivery_available,
                                     nationwide_shipping, appointment_required
    shipping_available      bool   — derived/explicit shipping flag for filters
    scout_needed            bool   — seller asking for a scout
    scouts_available        bool   — seller offering scout services
    meetup_notes            text   — freeform meetup/pickup notes
    marketplace_found       text   — present already on community_posts;
                                     mirrored to marketplace_listings &
                                     external_listings for cross-feature filters
    address_reveal_policy   text   — 'on_contact' | 'on_appointment' |
                                     'on_purchase' | 'never'

  Also adds:
    - `listing_reports` table for scam/safety reports (insert-only for users)
    - `get_my_exact_address(p_table text, p_id uuid)` RPC — owner reads only
*/

------------------------------------------------------------------------------
-- community_posts (Flash Finds)
------------------------------------------------------------------------------
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS general_location      text DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS exact_address_private text;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS pickup_type           text[] DEFAULT '{}';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS shipping_available    boolean DEFAULT false;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS scout_needed          boolean DEFAULT false;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS scouts_available      boolean DEFAULT false;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS meetup_notes          text DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS address_reveal_policy text DEFAULT 'on_contact';

CREATE INDEX IF NOT EXISTS idx_cp_general_location ON community_posts(general_location);
CREATE INDEX IF NOT EXISTS idx_cp_shipping         ON community_posts(shipping_available);
CREATE INDEX IF NOT EXISTS idx_cp_scout_needed     ON community_posts(scout_needed);

------------------------------------------------------------------------------
-- marketplace_listings
------------------------------------------------------------------------------
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS general_location      text DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS exact_address_private text;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS pickup_type           text[] DEFAULT '{}';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS shipping_available    boolean DEFAULT false;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS scout_needed          boolean DEFAULT false;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS scouts_available      boolean DEFAULT false;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS meetup_notes          text DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS marketplace_found     text DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS address_reveal_policy text DEFAULT 'on_contact';

CREATE INDEX IF NOT EXISTS idx_ml_general_location ON marketplace_listings(general_location);
CREATE INDEX IF NOT EXISTS idx_ml_shipping         ON marketplace_listings(shipping_available);
CREATE INDEX IF NOT EXISTS idx_ml_scout_needed     ON marketplace_listings(scout_needed);
CREATE INDEX IF NOT EXISTS idx_ml_marketplace      ON marketplace_listings(marketplace_found);

------------------------------------------------------------------------------
-- external_listings (Auctions / LiveHub events)
------------------------------------------------------------------------------
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS general_location      text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS exact_address_private text;
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS pickup_type           text[] DEFAULT '{}';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS scouts_available      boolean DEFAULT false;
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS meetup_notes          text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS marketplace_found     text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS address_reveal_policy text DEFAULT 'on_contact';

CREATE INDEX IF NOT EXISTS idx_el_general_location ON external_listings(general_location);
CREATE INDEX IF NOT EXISTS idx_el_marketplace      ON external_listings(marketplace_found);

------------------------------------------------------------------------------
-- listing_reports — scam / safety / inaccurate listing reports
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_table   text NOT NULL CHECK (listing_table IN
                    ('community_posts','marketplace_listings','external_listings')),
  listing_id      uuid NOT NULL,
  reason          text NOT NULL,
  details         text DEFAULT '',
  status          text NOT NULL DEFAULT 'pending',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can file reports" ON listing_reports;
CREATE POLICY "Users can file reports"
  ON listing_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can read own reports" ON listing_reports;
CREATE POLICY "Users can read own reports"
  ON listing_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_listing_reports_target
  ON listing_reports(listing_table, listing_id);

------------------------------------------------------------------------------
-- Owner-only RPC for revealing the private exact address
-- The app never SELECTs `exact_address_private` in normal feed queries.
-- The owner can call this RPC to read their own row's address.
-- Future buyer-approval flow will extend this with a second policy check.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_exact_address(p_table text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_addr text;
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_table = 'community_posts' THEN
    SELECT exact_address_private, user_id INTO v_addr, v_owner
    FROM community_posts WHERE id = p_id;
  ELSIF p_table = 'marketplace_listings' THEN
    SELECT exact_address_private, seller_id INTO v_addr, v_owner
    FROM marketplace_listings WHERE id = p_id;
  ELSIF p_table = 'external_listings' THEN
    SELECT exact_address_private, user_id INTO v_addr, v_owner
    FROM external_listings WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'invalid table' USING ERRCODE = '22023';
  END IF;

  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN v_addr;
END;
$$;

REVOKE ALL ON FUNCTION get_my_exact_address(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_my_exact_address(text, uuid) TO authenticated;

------------------------------------------------------------------------------
-- Column-level privacy: exact_address_private must never leak via SELECT *.
-- PostgREST honors column-level GRANTs, so revoking SELECT on this column
-- from `anon` and `authenticated` means client `select('*')` calls simply
-- cannot return it. Owner reads still work via the SECURITY DEFINER RPC.
------------------------------------------------------------------------------
REVOKE SELECT (exact_address_private) ON community_posts      FROM anon, authenticated;
REVOKE SELECT (exact_address_private) ON marketplace_listings FROM anon, authenticated;
REVOKE SELECT (exact_address_private) ON external_listings    FROM anon, authenticated;

-- Owners still need to write/update this column on their own rows.
GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
  ON community_posts      TO authenticated;
GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
  ON marketplace_listings TO authenticated;
GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
  ON external_listings    TO authenticated;

NOTIFY pgrst, 'reload schema';
