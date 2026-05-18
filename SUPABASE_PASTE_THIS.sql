-- =============================================================================
-- TreasureTrail — Live Events / Auctions / External Listings migration
-- Paste this ENTIRE file into the Supabase SQL Editor and click "Run".
-- Safe to re-run (everything is idempotent: IF NOT EXISTS / OR REPLACE / DROP IF).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) external_listings table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       text NOT NULL DEFAULT 'other',
  platform_label text DEFAULT '',
  listing_type   text NOT NULL DEFAULT 'auction',
  title          text NOT NULL,
  description    text DEFAULT '',
  image_url      text,
  external_url   text NOT NULL,
  price_display  text DEFAULT '',
  category       text DEFAULT 'other',
  condition      text DEFAULT 'good',
  ships_available boolean DEFAULT false,
  local_pickup   boolean DEFAULT false,
  ends_at        timestamptz,
  location       text DEFAULT '',
  scout_needed   boolean DEFAULT false,
  status         text DEFAULT 'active',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE external_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view active external listings" ON external_listings;
CREATE POLICY "Anyone authenticated can view active external listings"
  ON external_listings FOR SELECT
  TO authenticated
  USING (status = 'active' OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can submit external listings" ON external_listings;
CREATE POLICY "Users can submit external listings"
  ON external_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own external listings" ON external_listings;
CREATE POLICY "Users can update own external listings"
  ON external_listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own external listings" ON external_listings;
CREATE POLICY "Users can delete own external listings"
  ON external_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_external_listings_status  ON external_listings(status);
CREATE INDEX IF NOT EXISTS idx_external_listings_user    ON external_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_external_listings_type    ON external_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_external_listings_created ON external_listings(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2) Logistics / scout / safety columns (idempotent)
--    These match the existing client code in src/pages/LiveHub.tsx
-- -----------------------------------------------------------------------------
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS general_location      text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS exact_address_private text;
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS pickup_type           text[] DEFAULT '{}';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS scouts_available      boolean DEFAULT false;
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS meetup_notes          text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS marketplace_found     text DEFAULT '';
ALTER TABLE external_listings ADD COLUMN IF NOT EXISTS address_reveal_policy text DEFAULT 'on_contact';

CREATE INDEX IF NOT EXISTS idx_el_general_location ON external_listings(general_location);
CREATE INDEX IF NOT EXISTS idx_el_marketplace      ON external_listings(marketplace_found);

-- -----------------------------------------------------------------------------
-- 3) Same logistics columns on community_posts & marketplace_listings
--    (only run-effective for tables you already have; wrapped in DO blocks)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='community_posts') THEN
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
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='marketplace_listings') THEN
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
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) listing_reports — scam / safety report table
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5) Owner-only RPC for revealing the private exact address
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 6) Column-level privacy: never leak exact_address_private via SELECT *
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='community_posts' AND column_name='exact_address_private') THEN
    REVOKE SELECT (exact_address_private) ON community_posts FROM anon, authenticated;
    GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
      ON community_posts TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='marketplace_listings' AND column_name='exact_address_private') THEN
    REVOKE SELECT (exact_address_private) ON marketplace_listings FROM anon, authenticated;
    GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
      ON marketplace_listings TO authenticated;
  END IF;
END $$;

REVOKE SELECT (exact_address_private) ON external_listings FROM anon, authenticated;
GRANT INSERT (exact_address_private), UPDATE (exact_address_private)
  ON external_listings TO authenticated;

-- -----------------------------------------------------------------------------
-- 7) Force PostgREST to reload its schema cache so the new table is visible
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- Done. You should see "Success. No rows returned" in the SQL editor.
