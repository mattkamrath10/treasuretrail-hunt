-- Pre-launch hardening: lock down direct UPDATE on `auctions`.
--
-- The prior policy was `USING (true) WITH CHECK (true)`, which allowed
-- any authenticated user to mutate any auction row directly from the
-- client. Bidding is supposed to go through the `place_bid` SECURITY
-- DEFINER RPC, which validates every bid rule and bypasses RLS by
-- design. This migration restricts direct UPDATE to the seller of the
-- underlying listing (e.g. cancelling their own auction); all bidding
-- continues to flow through `place_bid` unchanged.

DROP POLICY IF EXISTS "Authenticated users can update auctions to bid" ON auctions;
DROP POLICY IF EXISTS "Listing owners can update own auctions" ON auctions;

CREATE POLICY "Listing owners can update own auctions"
  ON auctions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE marketplace_listings.id = auctions.listing_id
      AND marketplace_listings.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE marketplace_listings.id = auctions.listing_id
      AND marketplace_listings.seller_id = auth.uid()
    )
  );
