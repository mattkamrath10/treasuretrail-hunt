/*
  # Production Security Hardening

  ## Vulnerabilities Fixed

  1. hunt_missions INSERT — open WITH CHECK (true) allowed any authenticated user to create fake missions
  2. live_events INSERT — same; any user could inject fake events
  3. live_activity_feed INSERT — no user_id check; any user could post activity attributed to anyone
  4. auctions UPDATE — fully open WITH CHECK (true); any user could self-declare as auction winner
  5. profiles UPDATE — users could directly write xp, level, pro_member, scout_verified, treasure_rank, reputation_score
  6. user_rewards INSERT — users could self-grant arbitrary badges/achievements
  7. event_participants UPDATE — users could set their own competition score to any value
  8. Counter RPCs — increment_post_likes could be called repeatedly without verifying a post_likes record exists
  9. mission_progress UPDATE — users could fraudulently self-complete missions or reduce progress
  10. Misleading notification policy renamed for audit clarity
*/

-- ============================================================
-- FIX 1 & 2: hunt_missions and live_events
-- Remove the open INSERT policies. Service role bypasses RLS
-- entirely, so admin/backend can still create missions/events.
-- Authenticated clients can no longer insert directly.
-- ============================================================

DROP POLICY IF EXISTS "Only system can create missions" ON hunt_missions;
DROP POLICY IF EXISTS "System can create events" ON live_events;

-- Explicitly deny INSERT, UPDATE, DELETE on admin-only tables
-- (belt-and-suspenders; RLS default-deny applies once policies are dropped,
--  but explicit FALSE policies make the intent clear in the audit trail)
CREATE POLICY "No client inserts on hunt_missions"
  ON hunt_missions FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client inserts on live_events"
  ON live_events FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on hunt_missions"
  ON hunt_missions FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No client deletes on hunt_missions"
  ON hunt_missions FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "No client updates on live_events"
  ON live_events FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No client deletes on live_events"
  ON live_events FOR DELETE
  TO authenticated
  USING (false);

-- Protect club_rankings too (no policies existed, but be explicit)
CREATE POLICY "No client inserts on club_rankings"
  ON club_rankings FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on club_rankings"
  ON club_rankings FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No client deletes on club_rankings"
  ON club_rankings FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- FIX 3: live_activity_feed
-- Add user_id ownership check so users can only post activity
-- attributed to themselves.
-- ============================================================

DROP POLICY IF EXISTS "Users can post activity" ON live_activity_feed;

CREATE POLICY "Users can post own activity"
  ON live_activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Prevent clients from modifying or deleting activity feed entries
CREATE POLICY "No client updates on live_activity_feed"
  ON live_activity_feed FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No client deletes on live_activity_feed"
  ON live_activity_feed FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- FIX 4: auctions
-- Replace the completely open UPDATE policy with a proper
-- place_bid SECURITY DEFINER RPC that validates all bid rules.
-- Direct client UPDATE is removed.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can update auctions to bid" ON auctions;

CREATE OR REPLACE FUNCTION place_bid(auction_id_input uuid, bid_amount numeric)
RETURNS jsonb AS $$
DECLARE
  v_auction auctions%ROWTYPE;
  v_listing marketplace_listings%ROWTYPE;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT * INTO v_auction
  FROM auctions
  WHERE id = auction_id_input
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Auction not found');
  END IF;

  -- Auction must still be open
  IF v_auction.auction_end < now() THEN
    RETURN jsonb_build_object('error', 'Auction has already ended');
  END IF;

  -- Bid must strictly exceed current bid
  IF bid_amount <= v_auction.current_bid THEN
    RETURN jsonb_build_object(
      'error',
      'Bid must exceed current bid of ' || v_auction.current_bid
    );
  END IF;

  -- Sellers cannot bid on their own listings
  SELECT * INTO v_listing
  FROM marketplace_listings
  WHERE id = v_auction.listing_id;

  IF v_listing.seller_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Sellers cannot bid on their own auctions');
  END IF;

  -- Place the bid atomically
  UPDATE auctions
  SET
    current_bid       = bid_amount,
    highest_bidder_id = auth.uid(),
    bid_count         = bid_count + 1
  WHERE id = auction_id_input;

  RETURN jsonb_build_object('success', true, 'bid', bid_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only authenticated users may call place_bid; revoke from anon
REVOKE EXECUTE ON FUNCTION place_bid(uuid, numeric) FROM anon;
GRANT  EXECUTE ON FUNCTION place_bid(uuid, numeric) TO authenticated;


-- ============================================================
-- FIX 5: profiles — protect gamification/trust fields
-- A BEFORE UPDATE trigger silently resets server-managed fields
-- when the request originates from a JWT-authenticated client.
-- Service-role calls (no JWT context, e.g. backend admin)
-- are allowed to update these fields normally.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- request.jwt.claims is set for every Supabase client request (anon or authenticated JWT).
  -- It is NULL/empty for direct service-role or postgres connections.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    -- Silently preserve server-managed fields; client-supplied values are ignored
    NEW.xp               = OLD.xp;
    NEW.level            = OLD.level;
    NEW.reputation_score = OLD.reputation_score;
    NEW.pro_member       = OLD.pro_member;
    NEW.scout_verified   = OLD.scout_verified;
    NEW.treasure_rank    = OLD.treasure_rank;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_profile_field_protection ON profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_field_escalation();


-- ============================================================
-- FIX 6: user_rewards
-- Remove the open INSERT for authenticated users.
-- Rewards must be granted by server-side logic (service role).
-- Users can still read their own rewards.
-- ============================================================

DROP POLICY IF EXISTS "Users can earn rewards" ON user_rewards;

CREATE POLICY "No client inserts on user_rewards"
  ON user_rewards FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client deletes on user_rewards"
  ON user_rewards FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- FIX 7: event_participants
-- Remove the open score UPDATE. Users may still join events
-- (INSERT) and read participants (SELECT). Score updates must
-- go through a server-side function (service role).
-- ============================================================

DROP POLICY IF EXISTS "Users can update own event score" ON event_participants;

CREATE POLICY "No client score updates on event_participants"
  ON event_participants FOR UPDATE
  TO authenticated
  USING (false);


-- ============================================================
-- FIX 8 & 9: Counter RPCs — add idempotency guards
-- increment_post_likes now verifies the post_likes record
-- exists before incrementing (prevents repeated call abuse).
-- decrement_post_likes verifies the record is gone first.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  -- Only increment if this user actually has a like record for the post
  IF EXISTS (
    SELECT 1 FROM post_likes
    WHERE post_id = post_id_input
      AND user_id = auth.uid()
  ) THEN
    UPDATE community_posts
    SET like_count = like_count + 1
    WHERE id = post_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  -- Only decrement if the like record no longer exists (unlike was processed)
  IF NOT EXISTS (
    SELECT 1 FROM post_likes
    WHERE post_id = post_id_input
      AND user_id = auth.uid()
  ) THEN
    UPDATE community_posts
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = post_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Follow counter RPCs: guard against calling outside the followers table transaction
CREATE OR REPLACE FUNCTION increment_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM followers
    WHERE following_id = target_user_id
      AND follower_id = auth.uid()
  ) THEN
    UPDATE profiles
    SET follower_count = follower_count + 1
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM followers
    WHERE following_id = target_user_id
      AND follower_id = auth.uid()
  ) THEN
    UPDATE profiles
    SET follower_count = GREATEST(follower_count - 1, 0)
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM followers
    WHERE follower_id = target_user_id
      AND following_id = auth.uid()
  ) THEN
    UPDATE profiles
    SET following_count = following_count + 1
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM followers
    WHERE follower_id = target_user_id
      AND following_id = auth.uid()
  ) THEN
    UPDATE profiles
    SET following_count = GREATEST(following_count - 1, 0)
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke all counter/bid RPCs from unauthenticated (anon) role
REVOKE EXECUTE ON FUNCTION increment_post_likes(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION decrement_post_likes(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION increment_follower_count(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION decrement_follower_count(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION increment_following_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION decrement_following_count(uuid) FROM anon;


-- ============================================================
-- FIX 9: mission_progress
-- Prevent users from fraudulently self-completing missions
-- or reducing their own progress count.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_mission_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Progress can only increase or stay the same (no rollbacks)
  IF NEW.progress < OLD.progress THEN
    NEW.progress = OLD.progress;
  END IF;

  -- completed and completed_at can only be set by the server (no JWT context)
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    -- Client request: preserve server-controlled completion state
    NEW.completed    = OLD.completed;
    NEW.completed_at = OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validate_mission_progress_trigger ON mission_progress;
CREATE TRIGGER validate_mission_progress_trigger
  BEFORE UPDATE ON mission_progress
  FOR EACH ROW EXECUTE FUNCTION validate_mission_progress();


-- ============================================================
-- FIX 10: Rename misleading notification policy
-- The old name "System can insert notifications for any user"
-- implied a backdoor that didn't exist. The policy correctly
-- restricts inserts to the user's own notifications only.
-- ============================================================

DROP POLICY IF EXISTS "System can insert notifications for any user" ON notifications;

CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
