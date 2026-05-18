/*
  # External Marketplace & Live Selling Hub

  1. New Table
    - `external_listings` — user-submitted external platform links
      Supports: Whatnot, Poshmark, eBay, HiBid, MaxSold, EstateSales.net,
      Facebook Marketplace, and any other platform via `platform_label`.

  2. Columns
    - platform        text  — known platform id ('whatnot' | 'poshmark' | 'ebay' | ...)
    - platform_label  text  — custom label when platform = 'other'
    - listing_type    text  — 'live_stream' | 'auction' | 'fixed' | 'estate'
    - external_url    text  — the link to the original listing
    - price_display   text  — freeform price string ("$25", "Starting at $100", etc.)
    - ships_available boolean
    - local_pickup    boolean
    - scout_needed    boolean
    - ends_at         timestamptz (nullable)

  3. Security
    - RLS enabled; authenticated users can read active listings
    - Users can only insert/update/delete their own records
*/

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
