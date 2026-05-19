-- Allow signed-out (anon) visitors to read the public feed and live
-- events. Without this, guests landing on the home page hit RLS and
-- see "No finds yet" even though authenticated users see the feed.
--
-- Scope: SELECT only, only on tables that are already meant to be
-- publicly browsable in the app. Writes still require auth.
--
-- Safe to re-run.

-- community_posts (the Home feed)
DROP POLICY IF EXISTS "Anyone can view community posts" ON public.community_posts;
CREATE POLICY "Anyone can view community posts"
  ON public.community_posts FOR SELECT
  TO anon, authenticated
  USING (true);

-- external_listings (Live Hub feed)
DROP POLICY IF EXISTS "Anyone can view active external listings" ON public.external_listings;
CREATE POLICY "Anyone can view active external listings"
  ON public.external_listings FOR SELECT
  TO anon, authenticated
  USING (COALESCE(status, 'active') = 'active');

-- marketplace_listings (active items)
DROP POLICY IF EXISTS "Anyone can view active marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Anyone can view active marketplace listings"
  ON public.marketplace_listings FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

-- auctions (live bidding info)
DROP POLICY IF EXISTS "Anyone can view auctions" ON public.auctions;
CREATE POLICY "Anyone can view auctions"
  ON public.auctions FOR SELECT
  TO anon, authenticated
  USING (true);

-- profiles: allow anon read of the public-facing fields so feed cards
-- can show usernames + avatars. RLS in Postgres is row-level, not
-- column-level — column-level secrets (email/exact_address_private)
-- are already revoked from anon via column GRANTs in earlier migrations.
DROP POLICY IF EXISTS "Anyone can view public profile fields" ON public.profiles;
CREATE POLICY "Anyone can view public profile fields"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);
