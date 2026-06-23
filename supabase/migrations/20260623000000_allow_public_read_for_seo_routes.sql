/*
  # Allow public reads for SEO routes and listing detail pages

  The public SEO pages introduced in the app need anonymous read access for:
  - marketplace listings used by wanted pages and public listing detail pages
  - seller profile data joined into marketplace listings
  - published events used by public event SEO pages

  This migration widens SELECT access only. It does not change insert/update/delete
  ownership rules for signed-in users.
*/

-- Public profiles are needed for seller handles, avatars, and trust badges
DROP POLICY IF EXISTS "Public can read profiles for SEO pages" ON profiles;
CREATE POLICY "Public can read profiles for SEO pages"
  ON profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Active marketplace listings must be visible to public SEO routes
DROP POLICY IF EXISTS "Public can read active marketplace listings" ON marketplace_listings;
CREATE POLICY "Public can read active marketplace listings"
  ON marketplace_listings
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active' OR seller_id = auth.uid());

-- Public event pages need access to published event records
DROP POLICY IF EXISTS "Public can read published events for SEO pages" ON events;
CREATE POLICY "Public can read published events for SEO pages"
  ON events
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR holder_id = auth.uid());
