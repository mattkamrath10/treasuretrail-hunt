-- Pre-launch hardening: tighten EXECUTE grants on SECURITY DEFINER RPCs.
--
-- Postgres functions are executable by PUBLIC by default. Several of
-- our user-mutating RPCs only ran `REVOKE EXECUTE ... FROM anon`,
-- which left the implicit PUBLIC grant in place — meaning an
-- unauthenticated caller could still execute them and (because they
-- are SECURITY DEFINER) bypass RLS. This migration:
--
-- 1. Adds `REVOKE EXECUTE ... FROM PUBLIC` for every user-mutating
--    SECURITY DEFINER RPC.
-- 2. Re-grants EXECUTE to `authenticated` so signed-in users continue
--    to work normally.
-- 3. Adds a defensive `auth.uid() IS NULL` guard inside `place_bid`
--    so even if the grant pattern regresses, an unauthenticated call
--    cannot mutate the auction (and we never write
--    highest_bidder_id = NULL).

-- ---------- place_bid: defense-in-depth auth guard ----------
CREATE OR REPLACE FUNCTION place_bid(auction_id_input uuid, bid_amount numeric)
RETURNS jsonb AS $$
DECLARE
  v_auction auctions%ROWTYPE;
  v_listing marketplace_listings%ROWTYPE;
  v_uid     uuid := auth.uid();
BEGIN
  -- Hard refuse anonymous calls. The grant table should already
  -- prevent this, but SECURITY DEFINER means we treat the auth
  -- context as untrusted and double-check.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Authentication required');
  END IF;

  SELECT * INTO v_auction
  FROM auctions
  WHERE id = auction_id_input
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Auction not found');
  END IF;

  IF v_auction.auction_end < now() THEN
    RETURN jsonb_build_object('error', 'Auction has already ended');
  END IF;

  IF bid_amount <= v_auction.current_bid THEN
    RETURN jsonb_build_object(
      'error',
      'Bid must exceed current bid of ' || v_auction.current_bid
    );
  END IF;

  SELECT * INTO v_listing
  FROM marketplace_listings
  WHERE id = v_auction.listing_id;

  IF v_listing.seller_id = v_uid THEN
    RETURN jsonb_build_object('error', 'Sellers cannot bid on their own auctions');
  END IF;

  UPDATE auctions
  SET
    current_bid       = bid_amount,
    highest_bidder_id = v_uid,
    bid_count         = bid_count + 1
  WHERE id = auction_id_input;

  RETURN jsonb_build_object('success', true, 'bid', bid_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- Grant hardening: revoke PUBLIC, keep authenticated ----------
REVOKE EXECUTE ON FUNCTION place_bid(uuid, numeric)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION place_bid(uuid, numeric)              FROM anon;
GRANT  EXECUTE ON FUNCTION place_bid(uuid, numeric)              TO   authenticated;

REVOKE EXECUTE ON FUNCTION increment_post_likes(uuid)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_post_likes(uuid)            FROM anon;
GRANT  EXECUTE ON FUNCTION increment_post_likes(uuid)            TO   authenticated;

REVOKE EXECUTE ON FUNCTION decrement_post_likes(uuid)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrement_post_likes(uuid)            FROM anon;
GRANT  EXECUTE ON FUNCTION decrement_post_likes(uuid)            TO   authenticated;

REVOKE EXECUTE ON FUNCTION increment_follower_count(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_follower_count(uuid)        FROM anon;
GRANT  EXECUTE ON FUNCTION increment_follower_count(uuid)        TO   authenticated;

REVOKE EXECUTE ON FUNCTION decrement_follower_count(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrement_follower_count(uuid)        FROM anon;
GRANT  EXECUTE ON FUNCTION decrement_follower_count(uuid)        TO   authenticated;

REVOKE EXECUTE ON FUNCTION increment_following_count(uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_following_count(uuid)       FROM anon;
GRANT  EXECUTE ON FUNCTION increment_following_count(uuid)       TO   authenticated;

REVOKE EXECUTE ON FUNCTION decrement_following_count(uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrement_following_count(uuid)       FROM anon;
GRANT  EXECUTE ON FUNCTION decrement_following_count(uuid)       TO   authenticated;
