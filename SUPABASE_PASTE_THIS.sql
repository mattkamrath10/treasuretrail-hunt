-- =============================================================================
-- TreasureTrail — FULL SCHEMA SETUP
-- Paste this ENTIRE file into the Supabase SQL Editor and click "Run".
-- Safe to re-run (idempotent: IF NOT EXISTS, OR REPLACE, DROP POLICY IF EXISTS).
-- Generated 2026-05-18T23:05:14Z from supabase/migrations/*.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- FROM: 20260517052053_create_profiles_table.sql
-- -----------------------------------------------------------------------------
/*
  # Create profiles table for TreasureTrail users

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique, user's chosen display name)
      - `bio` (text, short user biography)
      - `avatar_url` (text, nullable, URL to profile photo)
      - `favorite_categories` (text array, user's preferred hunting categories)
      - `created_at` (timestamptz, when the profile was created)
      - `updated_at` (timestamptz, last profile update)

  2. Security
    - Enable RLS on `profiles` table
    - Add policy for authenticated users to read their own profile
    - Add policy for authenticated users to insert their own profile
    - Add policy for authenticated users to update their own profile
    - Add policy for authenticated users to read other users' profiles (for social features)

  3. Notes
    - The `id` column references `auth.users(id)` to link profiles to Supabase auth
    - `favorite_categories` stores an array of category strings chosen during onboarding
    - Username has a minimum length constraint of 3 characters
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL CHECK (char_length(username) >= 3),
  bio text DEFAULT '',
  avatar_url text,
  favorite_categories text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read other profiles for social features" ON profiles;
CREATE POLICY "Users can read other profiles for social features"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() != id);


-- -----------------------------------------------------------------------------
-- FROM: 20260517081256_add_profile_fields_and_core_tables.sql
-- -----------------------------------------------------------------------------
/*
  # Expand profiles and create core application tables

  1. Modified Tables
    - `profiles` - Added columns: treasure_rank, xp, level, reputation_score, 
      scout_verified, pro_member, follower_count, following_count

  2. New Tables
    - `flash_finds` - User-uploaded treasure finds with rarity scores
    - `marketplace_listings` - Items listed for sale/auction
    - `messages` - Direct messages between users
    - `auctions` - Auction data for listings
    - `followers` - Follow relationships between users
    - `notifications` - User notification entries
    - `community_posts` - Social feed posts with types and engagement counts
    - `post_likes` - Like tracking for community posts

  3. Security
    - RLS enabled on all new tables
    - Policies ensure users can only access their own data or public data
    - Insert/update/delete restricted to resource owners
*/

-- Expand profiles table with gamification and trust fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'treasure_rank'
  ) THEN
    ALTER TABLE profiles ADD COLUMN treasure_rank text DEFAULT 'Hunter';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'xp'
  ) THEN
    ALTER TABLE profiles ADD COLUMN xp integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN level integer DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'reputation_score'
  ) THEN
    ALTER TABLE profiles ADD COLUMN reputation_score numeric(3,1) DEFAULT 5.0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'scout_verified'
  ) THEN
    ALTER TABLE profiles ADD COLUMN scout_verified boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'pro_member'
  ) THEN
    ALTER TABLE profiles ADD COLUMN pro_member boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'follower_count'
  ) THEN
    ALTER TABLE profiles ADD COLUMN follower_count integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'following_count'
  ) THEN
    ALTER TABLE profiles ADD COLUMN following_count integer DEFAULT 0;
  END IF;
END $$;

-- Flash Finds
CREATE TABLE IF NOT EXISTS flash_finds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  image_url text,
  estimated_value numeric(10,2),
  rarity_score numeric(3,1) DEFAULT 0,
  category text DEFAULT 'other',
  location text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flash_finds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read flash finds" ON flash_finds;
CREATE POLICY "Anyone authenticated can read flash finds"
  ON flash_finds FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own flash finds" ON flash_finds;
CREATE POLICY "Users can insert own flash finds"
  ON flash_finds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own flash finds" ON flash_finds;
CREATE POLICY "Users can update own flash finds"
  ON flash_finds FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own flash finds" ON flash_finds;
CREATE POLICY "Users can delete own flash finds"
  ON flash_finds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Marketplace Listings
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  price numeric(10,2) NOT NULL,
  condition text DEFAULT 'good',
  category text DEFAULT 'other',
  image_url text,
  auction_enabled boolean DEFAULT false,
  local_pickup boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view active listings" ON marketplace_listings;
CREATE POLICY "Anyone authenticated can view active listings"
  ON marketplace_listings FOR SELECT
  TO authenticated
  USING (status = 'active' OR seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own listings" ON marketplace_listings;
CREATE POLICY "Users can create own listings"
  ON marketplace_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can update own listings" ON marketplace_listings;
CREATE POLICY "Users can update own listings"
  ON marketplace_listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can delete own listings" ON marketplace_listings;
CREATE POLICY "Users can delete own listings"
  ON marketplace_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update own sent messages" ON messages;
CREATE POLICY "Users can update own sent messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Auctions
CREATE TABLE IF NOT EXISTS auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  current_bid numeric(10,2) DEFAULT 0,
  highest_bidder_id uuid REFERENCES auth.users(id),
  bid_count integer DEFAULT 0,
  auction_end timestamptz NOT NULL,
  scout_needed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view auctions" ON auctions;
CREATE POLICY "Anyone authenticated can view auctions"
  ON auctions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Listing owners can create auctions" ON auctions;
CREATE POLICY "Listing owners can create auctions"
  ON auctions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE marketplace_listings.id = listing_id
      AND marketplace_listings.seller_id = auth.uid()
    )
  );

-- Direct UPDATE on auctions is restricted to the owning listing's seller
-- (e.g. cancelling their own auction). Bidding goes through the
-- `place_bid` SECURITY DEFINER RPC, which bypasses RLS by design and
-- validates every bid rule. Previously this policy was USING(true)
-- WITH CHECK(true), which let any authenticated user mutate any
-- auction row directly from the client. Pre-launch hardening.
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

-- Followers
CREATE TABLE IF NOT EXISTS followers (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view follow relationships" ON followers;
CREATE POLICY "Anyone authenticated can view follow relationships"
  ON followers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON followers;
CREATE POLICY "Users can follow others"
  ON followers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);

DROP POLICY IF EXISTS "Users can unfollow" ON followers;
CREATE POLICY "Users can unfollow"
  ON followers FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  content text DEFAULT '',
  read_status boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications for any user" ON notifications;
CREATE POLICY "System can insert notifications for any user"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Community Posts
CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text DEFAULT 'find',
  caption text DEFAULT '',
  image_url text,
  tags text[] DEFAULT '{}',
  location text DEFAULT '',
  rarity_score numeric(3,1),
  estimated_value numeric(10,2),
  scout_assisted boolean DEFAULT false,
  for_sale boolean DEFAULT false,
  category text DEFAULT 'other',
  like_count integer DEFAULT 0,
  comment_count integer DEFAULT 0,
  share_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view community posts" ON community_posts;
CREATE POLICY "Anyone authenticated can view community posts"
  ON community_posts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create own posts" ON community_posts;
CREATE POLICY "Users can create own posts"
  ON community_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own posts" ON community_posts;
CREATE POLICY "Users can update own posts"
  ON community_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own posts" ON community_posts;
CREATE POLICY "Users can delete own posts"
  ON community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Post Likes
CREATE TABLE IF NOT EXISTS post_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view likes" ON post_likes;
CREATE POLICY "Anyone authenticated can view likes"
  ON post_likes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can like posts" ON post_likes;
CREATE POLICY "Users can like posts"
  ON post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike posts" ON post_likes;
CREATE POLICY "Users can unlike posts"
  ON post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_flash_finds_user ON flash_finds(user_id);
CREATE INDEX IF NOT EXISTS idx_flash_finds_created ON flash_finds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_seller ON marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_status);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);


-- -----------------------------------------------------------------------------
-- FROM: 20260517081357_create_counter_rpc_functions.sql
-- -----------------------------------------------------------------------------
/*
  # Create RPC functions for safe counter operations

  1. New Functions
    - `increment_post_likes` - Atomically increment like_count on community_posts
    - `decrement_post_likes` - Atomically decrement like_count on community_posts
    - `increment_follower_count` - Atomically increment follower_count on profiles
    - `decrement_follower_count` - Atomically decrement follower_count on profiles
    - `increment_following_count` - Atomically increment following_count on profiles
    - `decrement_following_count` - Atomically decrement following_count on profiles

  2. Notes
    - These functions use atomic updates to avoid race conditions
    - Decrement functions ensure counts never go below 0
*/

CREATE OR REPLACE FUNCTION increment_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE community_posts
  SET like_count = like_count + 1
  WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE community_posts
  SET like_count = GREATEST(like_count - 1, 0)
  WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET follower_count = follower_count + 1
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET follower_count = GREATEST(follower_count - 1, 0)
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET following_count = following_count + 1
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET following_count = GREATEST(following_count - 1, 0)
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -----------------------------------------------------------------------------
-- FROM: 20260517082835_create_live_events_and_missions_tables.sql
-- -----------------------------------------------------------------------------
/*
  # Create Live Events, Hunt Missions, and Competition Tables

  1. New Tables
    - `hunt_missions` - Gamified missions with XP rewards, timers, and rarity tiers
      - id, title, description, type, rarity, xp_reward, difficulty, category,
        region, participant_count, max_participants, starts_at, ends_at, status
    - `mission_progress` - User progress on individual missions
      - id, user_id, mission_id, progress, total, completed, completed_at, created_at
    - `live_events` - Community events with live activity
      - id, title, description, type, image_url, region, starts_at, ends_at,
        participant_count, rarity_boost, reward_tier, status, featured
    - `event_participants` - Users joined to events
      - id, user_id, event_id, joined_at, score
    - `club_rankings` - Competitive club leaderboard data
      - id, club_name, xp_total, member_count, rank, season, region
    - `user_rewards` - Earned rewards and badges
      - id, user_id, reward_type, reward_name, reward_tier, earned_at
    - `live_activity_feed` - Global activity stream entries
      - id, user_id, activity_type, content, region, rarity_level, created_at

  2. Security
    - RLS enabled on all tables
    - Authenticated users can read all public data
    - Users can only modify their own progress/participation records

  3. Notes
    - Indexes added for performance on common query patterns
    - Reward tiers: bronze, silver, gold, platinum, legendary
    - Mission rarities: common, rare, epic, legendary
*/

-- Hunt Missions
CREATE TABLE IF NOT EXISTS hunt_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'daily',
  rarity text NOT NULL DEFAULT 'common',
  xp_reward integer NOT NULL DEFAULT 100,
  coin_reward integer DEFAULT 0,
  difficulty text DEFAULT 'medium',
  category text DEFAULT 'general',
  region text DEFAULT '',
  participant_count integer DEFAULT 0,
  max_participants integer DEFAULT 0,
  total_steps integer DEFAULT 1,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  status text DEFAULT 'active',
  rarity_multiplier numeric(3,1) DEFAULT 1.0,
  pro_exclusive boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hunt_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view missions" ON hunt_missions;
CREATE POLICY "Anyone authenticated can view missions"
  ON hunt_missions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only system can create missions" ON hunt_missions;
CREATE POLICY "Only system can create missions"
  ON hunt_missions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Mission Progress
CREATE TABLE IF NOT EXISTS mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES hunt_missions(id) ON DELETE CASCADE,
  progress integer DEFAULT 0,
  total integer DEFAULT 1,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mission_id)
);

ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mission progress" ON mission_progress;
CREATE POLICY "Users can view own mission progress"
  ON mission_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own progress" ON mission_progress;
CREATE POLICY "Users can insert own progress"
  ON mission_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own progress" ON mission_progress;
CREATE POLICY "Users can update own progress"
  ON mission_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Live Events
CREATE TABLE IF NOT EXISTS live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'community',
  image_url text,
  region text DEFAULT '',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  participant_count integer DEFAULT 0,
  rarity_boost numeric(3,1) DEFAULT 1.0,
  reward_tier text DEFAULT 'bronze',
  reward_xp integer DEFAULT 100,
  status text DEFAULT 'upcoming',
  featured boolean DEFAULT false,
  pro_exclusive boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view events" ON live_events;
CREATE POLICY "Anyone authenticated can view events"
  ON live_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "System can create events" ON live_events;
CREATE POLICY "System can create events"
  ON live_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Event Participants
CREATE TABLE IF NOT EXISTS event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  score integer DEFAULT 0,
  UNIQUE(user_id, event_id)
);

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view event participants" ON event_participants;
CREATE POLICY "Users can view event participants"
  ON event_participants FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can join events" ON event_participants;
CREATE POLICY "Users can join events"
  ON event_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own event score" ON event_participants;
CREATE POLICY "Users can update own event score"
  ON event_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Club Rankings
CREATE TABLE IF NOT EXISTS club_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name text NOT NULL,
  xp_total integer DEFAULT 0,
  member_count integer DEFAULT 0,
  rank integer DEFAULT 0,
  season text DEFAULT 'spring_2026',
  region text DEFAULT '',
  icon text DEFAULT '',
  color text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE club_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view club rankings" ON club_rankings;
CREATE POLICY "Anyone authenticated can view club rankings"
  ON club_rankings FOR SELECT
  TO authenticated
  USING (true);

-- User Rewards
CREATE TABLE IF NOT EXISTS user_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type text NOT NULL DEFAULT 'badge',
  reward_name text NOT NULL,
  reward_tier text DEFAULT 'bronze',
  mission_id uuid REFERENCES hunt_missions(id),
  event_id uuid REFERENCES live_events(id),
  earned_at timestamptz DEFAULT now()
);

ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rewards" ON user_rewards;
CREATE POLICY "Users can view own rewards"
  ON user_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can earn rewards" ON user_rewards;
CREATE POLICY "Users can earn rewards"
  ON user_rewards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Live Activity Feed
CREATE TABLE IF NOT EXISTS live_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL DEFAULT 'find',
  content text NOT NULL,
  region text DEFAULT '',
  rarity_level text DEFAULT 'common',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE live_activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view activity feed" ON live_activity_feed;
CREATE POLICY "Anyone authenticated can view activity feed"
  ON live_activity_feed FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can post activity" ON live_activity_feed;
CREATE POLICY "Users can post activity"
  ON live_activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hunt_missions_status ON hunt_missions(status);
CREATE INDEX IF NOT EXISTS idx_hunt_missions_type ON hunt_missions(type);
CREATE INDEX IF NOT EXISTS idx_mission_progress_user ON mission_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_live_events_status ON live_events(status);
CREATE INDEX IF NOT EXISTS idx_live_events_starts ON live_events(starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_live_activity_created ON live_activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_rankings_season ON club_rankings(season, rank);


-- -----------------------------------------------------------------------------
-- FROM: 20260517210833_create_avatars_storage_bucket.sql
-- -----------------------------------------------------------------------------
-- # Create avatars storage bucket
--
-- 1. Storage
--   - Creates a public `avatars` bucket for user profile photos
-- 2. Policies
--   - Authenticated users can upload to their own folder (user_id/...)
--   - Authenticated users can update/delete their own files
--   - Anyone can read avatar images (public bucket)

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');


-- -----------------------------------------------------------------------------
-- FROM: 20260517230210_security_hardening.sql
-- -----------------------------------------------------------------------------
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
DROP POLICY IF EXISTS "No client inserts on hunt_missions" ON hunt_missions;
CREATE POLICY "No client inserts on hunt_missions"
  ON hunt_missions FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client inserts on live_events" ON live_events;
CREATE POLICY "No client inserts on live_events"
  ON live_events FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates on hunt_missions" ON hunt_missions;
CREATE POLICY "No client updates on hunt_missions"
  ON hunt_missions FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No client deletes on hunt_missions" ON hunt_missions;
CREATE POLICY "No client deletes on hunt_missions"
  ON hunt_missions FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No client updates on live_events" ON live_events;
CREATE POLICY "No client updates on live_events"
  ON live_events FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No client deletes on live_events" ON live_events;
CREATE POLICY "No client deletes on live_events"
  ON live_events FOR DELETE
  TO authenticated
  USING (false);

-- Protect club_rankings too (no policies existed, but be explicit)
DROP POLICY IF EXISTS "No client inserts on club_rankings" ON club_rankings;
CREATE POLICY "No client inserts on club_rankings"
  ON club_rankings FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates on club_rankings" ON club_rankings;
CREATE POLICY "No client updates on club_rankings"
  ON club_rankings FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No client deletes on club_rankings" ON club_rankings;
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

DROP POLICY IF EXISTS "Users can post own activity" ON live_activity_feed;
CREATE POLICY "Users can post own activity"
  ON live_activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Prevent clients from modifying or deleting activity feed entries
DROP POLICY IF EXISTS "No client updates on live_activity_feed" ON live_activity_feed;
CREATE POLICY "No client updates on live_activity_feed"
  ON live_activity_feed FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No client deletes on live_activity_feed" ON live_activity_feed;
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

DROP POLICY IF EXISTS "No client inserts on user_rewards" ON user_rewards;
CREATE POLICY "No client inserts on user_rewards"
  ON user_rewards FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client deletes on user_rewards" ON user_rewards;
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

DROP POLICY IF EXISTS "No client score updates on event_participants" ON event_participants;
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

DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- FROM: 20260517231448_create_external_listings.sql
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- FROM: 20260518000001_create_platform_submissions.sql
-- -----------------------------------------------------------------------------
create table if not exists platform_submissions (
  id uuid primary key default gen_random_uuid(),
  platform_name text not null,
  website_url text,
  description text,
  platform_type text not null default 'marketplace',
  shipping_supported boolean not null default false,
  scout_friendly boolean not null default false,
  logo_url text,
  submitted_by uuid references profiles(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table platform_submissions enable row level security;

drop policy if exists "Anyone can submit platforms" on platform_submissions;
create policy "Anyone can submit platforms"
  on platform_submissions for insert
  to authenticated, anon
  with check (true);

drop policy if exists "Anyone can read platform submissions" on platform_submissions;
create policy "Anyone can read platform submissions"
  on platform_submissions for select
  to authenticated, anon
  using (true);


-- -----------------------------------------------------------------------------
-- FROM: 20260518000002_add_location_marketplace_to_community_posts.sql
-- -----------------------------------------------------------------------------
/*
  # Flash Finds — Location Found & Marketplace Found

  1. Purpose
    - Ensures `community_posts` table exists (idempotent recreate of any missing
      columns) so the schema cache lines up with what the app inserts.
    - Adds two new reseller-focused metadata columns:
        * `location_found`    — free text, where the item was physically found
                                (e.g. "Phoenix AZ", "Storage Locker Auction")
        * `marketplace_found` — slug for which online marketplace surfaced it
                                (e.g. "facebook_marketplace", "ebay", "whatnot")

  2. Notes
    - `community_posts` already has a `location` column from the original
      migration; we keep it for backwards-compatibility and ALSO write to the
      new explicit `location_found` field going forward.
    - `NOTIFY pgrst, 'reload schema'` forces PostgREST to refresh its schema
      cache so the "Could not find the table 'public.community_posts' in the
      schema cache" error disappears immediately after this migration runs.
*/

CREATE TABLE IF NOT EXISTS community_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text DEFAULT 'find',
  caption         text DEFAULT '',
  image_url       text,
  tags            text[] DEFAULT '{}',
  location        text DEFAULT '',
  rarity_score    numeric(3,1),
  estimated_value numeric(10,2),
  scout_assisted  boolean DEFAULT false,
  for_sale        boolean DEFAULT false,
  category        text DEFAULT 'other',
  like_count      integer DEFAULT 0,
  comment_count   integer DEFAULT 0,
  share_count     integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS location_found    text DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS marketplace_found text DEFAULT '';

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Anyone authenticated can view community posts') THEN
    DROP POLICY IF EXISTS "Anyone authenticated can view community posts" ON community_posts;
    CREATE POLICY "Anyone authenticated can view community posts"
      ON community_posts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can create own posts') THEN
    DROP POLICY IF EXISTS "Users can create own posts" ON community_posts;
    CREATE POLICY "Users can create own posts"
      ON community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can update own posts') THEN
    DROP POLICY IF EXISTS "Users can update own posts" ON community_posts;
    CREATE POLICY "Users can update own posts"
      ON community_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can delete own posts') THEN
    DROP POLICY IF EXISTS "Users can delete own posts" ON community_posts;
    CREATE POLICY "Users can delete own posts"
      ON community_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_posts_marketplace ON community_posts(marketplace_found);
CREATE INDEX IF NOT EXISTS idx_community_posts_user        ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created     ON community_posts(created_at DESC);

NOTIFY pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- FROM: 20260518000003_ai_scans_and_membership.sql
-- -----------------------------------------------------------------------------
/*
  # AI Treasure Scan: usage logging & membership tiers

  1. Profile changes
    - Adds `membership_tier` text ('free' | 'pro') default 'free'.

  2. New table: `ai_scans_log`
    - One row per AI vision scan (success or cache hit).
    - Used for rate limiting (free=5/24h, pro soft cap 100/24h).
    - Stores image_hash so duplicate uploads within 24h can be served from cache.
    - Stores result_json for re-display & analytics.

  3. Security
    - RLS enabled. Users may insert/read only their own rows.

  4. Realtime / schema reload
    - NOTIFY pgrst, 'reload schema' so PostgREST picks up new column immediately.
*/

-- Profiles: membership_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'membership_tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN membership_tier text NOT NULL DEFAULT 'free'
      CHECK (membership_tier IN ('free', 'pro'));
  END IF;
END $$;

-- AI scans log
CREATE TABLE IF NOT EXISTS ai_scans_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT 'gpt-5.4',
  image_hash text,
  result_json jsonb,
  cached boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_scans_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own scans" ON ai_scans_log;
CREATE POLICY "Users can read own scans"
  ON ai_scans_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own scans" ON ai_scans_log;
CREATE POLICY "Users can insert own scans"
  ON ai_scans_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_scans_user_time
  ON ai_scans_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scans_user_hash
  ON ai_scans_log(user_id, image_hash);

NOTIFY pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- FROM: 20260518000004_ai_scan_atomic_claim.sql
-- -----------------------------------------------------------------------------
/*
  # Atomic AI scan slot reservation

  Rate-limit needs to be race-safe. Previously the server did:
    count -> compare -> OpenAI -> insert
  Two parallel requests could both pass the count check and both spend OpenAI
  tokens, exceeding free/pro caps.

  Fix: `claim_ai_scan_slot(p_limit)` takes a per-user advisory lock, counts
  scans in the last 24h, and (if under limit) inserts a placeholder row in the
  same critical section. The placeholder row immediately counts against the
  user's limit. The server later updates the row with the OpenAI result, or
  deletes it on failure.

  Cache hits intentionally do NOT consume a slot or insert a row — the user is
  re-served their own recent identical result for free. Frontend communicates
  this with the "Reused recent scan" banner.
*/

CREATE OR REPLACE FUNCTION claim_ai_scan_slot(p_limit int)
RETURNS TABLE (allowed boolean, used int, scan_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
  v_new_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Per-user advisory lock (auto-released at txn end).
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text));

  SELECT COUNT(*) INTO v_count
  FROM ai_scans_log
  WHERE user_id = v_user
    AND created_at >= now() - interval '24 hours';

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT false, v_count, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO ai_scans_log (user_id, model, image_hash, result_json, cached)
  VALUES (v_user, 'gpt-5.4', NULL, NULL, false)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT true, v_count + 1, v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_ai_scan_slot(int) FROM public;
GRANT EXECUTE ON FUNCTION claim_ai_scan_slot(int) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- -----------------------------------------------------------------------------
-- FROM: 20260518000005_listings_logistics_safety.sql
-- -----------------------------------------------------------------------------
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

-- Phase 4: Retention, alerts, and user-return systems.
-- Adds saved_searches, event_reminders, and extends notifications with richer fields.

-- ------------------------------------------------------------------
-- 1. Extend notifications table with richer metadata fields.
-- ------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_item_id text,
  ADD COLUMN IF NOT EXISTS related_item_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read_status, created_at DESC);

-- Restore strict owner-only INSERT: a user may only write notifications addressed to themselves.
-- Cross-user notifications (e.g. "@actor followed you") MUST go through the SECURITY DEFINER
-- function `notify_user` defined below, which gates the operation by an allow-list of types.
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications for any user" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON notifications;
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Cross-user notification helper. Bypasses RLS but only allows a small whitelist
-- of notification types and always stamps the caller as actor_user_id.
DROP FUNCTION IF EXISTS public.notify_user(uuid, text, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.notify_user(
  p_target uuid,
  p_type text,
  p_title text,
  p_content text DEFAULT '',
  p_related_item_id text DEFAULT NULL,
  p_related_item_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'target required';
  END IF;
  IF p_target = auth.uid() THEN
    -- self-notify is fine, just write it.
    NULL;
  END IF;
  IF p_type NOT IN ('follow','message','scout_response','listing_saved','listing_shared') THEN
    RAISE EXCEPTION 'notification type % is not allowed via notify_user', p_type;
  END IF;
  INSERT INTO notifications (
    user_id, type, title, content,
    actor_user_id, related_item_id, related_item_type, metadata
  ) VALUES (
    p_target, p_type, p_title, COALESCE(p_content, ''),
    auth.uid(), p_related_item_id, p_related_item_type, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- 2. Saved searches.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  keywords text NOT NULL DEFAULT '',
  categories text[] NOT NULL DEFAULT '{}'::text[],
  marketplaces text[] NOT NULL DEFAULT '{}'::text[],
  location_text text NOT NULL DEFAULT '',
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user
  ON saved_searches (user_id, created_at DESC);

DROP POLICY IF EXISTS "Users can read own saved searches" ON saved_searches;
CREATE POLICY "Users can read own saved searches"
  ON saved_searches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own saved searches" ON saved_searches;
CREATE POLICY "Users can create own saved searches"
  ON saved_searches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own saved searches" ON saved_searches;
CREATE POLICY "Users can update own saved searches"
  ON saved_searches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved searches" ON saved_searches;
CREATE POLICY "Users can delete own saved searches"
  ON saved_searches FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 3. Event reminders.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  remind_before_minutes integer NOT NULL DEFAULT 60,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_event_reminders_user
  ON event_reminders (user_id, event_id);

DROP POLICY IF EXISTS "Users can read own reminders" ON event_reminders;
CREATE POLICY "Users can read own reminders"
  ON event_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own reminders" ON event_reminders;
CREATE POLICY "Users can create own reminders"
  ON event_reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reminders" ON event_reminders;
CREATE POLICY "Users can update own reminders"
  ON event_reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reminders" ON event_reminders;
CREATE POLICY "Users can delete own reminders"
  ON event_reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
-- Phase 5: real-world event scheduling.
-- Add a dedicated start_at column to external_listings so we can model
-- Upcoming / Live Now / Ending Soon / Ended without relying on created_at
-- (which represents the upload time, not the event time).

ALTER TABLE external_listings
  ADD COLUMN IF NOT EXISTS start_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_external_listings_start_at
  ON external_listings (start_at);

CREATE INDEX IF NOT EXISTS idx_external_listings_ends_at
  ON external_listings (ends_at);

-- Note: existing rows leave start_at NULL. Clients fall back to created_at
-- when start_at is missing so historical uploads continue rendering.

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 20260519000001_admin_role_and_moderation.sql
-- Admin role + owner/admin DELETE permission system
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN role text NOT NULL DEFAULT 'user'
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role = 'admin';

CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    NEW.xp               = OLD.xp;
    NEW.level            = OLD.level;
    NEW.reputation_score = OLD.reputation_score;
    NEW.pro_member       = OLD.pro_member;
    NEW.scout_verified   = OLD.scout_verified;
    NEW.treasure_rank    = OLD.treasure_rank;
    NEW.role             = OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Users can delete own posts" ON community_posts;
DROP POLICY IF EXISTS "Owner or admin can delete posts" ON community_posts;
CREATE POLICY "Owner or admin can delete posts"
  ON community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own flash finds" ON flash_finds;
DROP POLICY IF EXISTS "Owner or admin can delete flash finds" ON flash_finds;
CREATE POLICY "Owner or admin can delete flash finds"
  ON flash_finds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own listings" ON marketplace_listings;
DROP POLICY IF EXISTS "Owner or admin can delete listings" ON marketplace_listings;
CREATE POLICY "Owner or admin can delete listings"
  ON marketplace_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id OR public.is_admin());

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'external_listings'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own external listings" ON external_listings';
    EXECUTE 'DROP POLICY IF EXISTS "Owner or admin can delete external listings" ON external_listings';
    EXECUTE $POL$
      CREATE POLICY "Owner or admin can delete external listings"
        ON external_listings FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id OR public.is_admin())
    $POL$;
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can delete any avatar" ON storage.objects;
CREATE POLICY "Admins can delete any avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND public.is_admin());

-- One-time owner promotion (replace 'matt' with the real username):
-- UPDATE profiles SET role = 'admin' WHERE username = 'matt';

NOTIFY pgrst, 'reload schema';
-- PHASE 8 — Marketplace Interaction System
--
-- Adds the backing schema for the core conversion loop:
--   Feed item → Listing detail → Seller profile → Message seller
-- plus saved listings and scout requests.
--
-- Tables:
--   conversations          1:1 chat thread, optionally tied to a listing
--   messages (ALTER)       adds conversation_id + listing link columns
--   saved_listings         per-user bookmark across community_posts / marketplace
--   scout_requests         "scout this item" requests addressed to a seller
--
-- All policies require the caller to be a member (user_a_id or user_b_id) or
-- the row owner. Admin overrides reuse `public.is_admin()` introduced in
-- 20260519000001_admin_role_and_moderation.sql.

-- =============================================================
-- conversations
-- =============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Sentinel for "any listing kind" so a single thread can also be opened
  -- without a listing context. listing_kind is one of: 'marketplace',
  -- 'community_post', 'external_listing'. NULL if no listing context.
  listing_id uuid,
  listing_kind text,
  last_message_at timestamptz DEFAULT now(),
  last_message_preview text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT conversations_users_distinct CHECK (user_a_id <> user_b_id),
  -- Normalize the pair so any direction lookup hits the same row. We enforce
  -- user_a_id < user_b_id via the convention in `get_or_create_conversation`,
  -- and a partial-unique index keys the listing-context pair.
  CONSTRAINT conversations_user_ordering CHECK (user_a_id < user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_listing_uidx
  ON public.conversations(user_a_id, user_b_id, COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(listing_kind, ''));
CREATE INDEX IF NOT EXISTS conversations_user_a_idx ON public.conversations(user_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON public.conversations(user_b_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read conversation" ON public.conversations;
CREATE POLICY "Members can read conversation"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id OR public.is_admin());

-- INSERT is funneled through the SECURITY DEFINER RPC `get_or_create_conversation`
-- (defined below) so the pair-ordering invariant cannot be violated by clients.
DROP POLICY IF EXISTS "No direct inserts" ON public.conversations;
CREATE POLICY "No direct inserts"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Members can update last-message" ON public.conversations;
CREATE POLICY "Members can update last-message"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- =============================================================
-- messages — extend with conversation + listing link
-- =============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS listing_id uuid,
  ADD COLUMN IF NOT EXISTS listing_kind text;

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages(conversation_id, created_at);

-- Tighten read policy: members of the conversation can read, plus admin.
DROP POLICY IF EXISTS "Users can read their own messages" ON public.messages;
DROP POLICY IF EXISTS "Members can read messages" ON public.messages;
CREATE POLICY "Members can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

-- INSERT: caller must be the sender and must be a member of the linked
-- conversation (when present).
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
      )
    )
  );

-- UPDATE: receiver can mark read.
-- Existing "Users can update own sent messages" policy already allows the
-- receiver to set read_at; we keep it.

-- =============================================================
-- get_or_create_conversation RPC
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_other_user uuid,
  p_listing_id uuid DEFAULT NULL,
  p_listing_kind text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;
  IF p_other_user IS NULL OR p_other_user = v_me THEN
    RAISE EXCEPTION 'invalid recipient';
  END IF;
  IF v_me < p_other_user THEN
    v_a := v_me; v_b := p_other_user;
  ELSE
    v_a := p_other_user; v_b := v_me;
  END IF;

  SELECT id INTO v_id
  FROM public.conversations
  WHERE user_a_id = v_a
    AND user_b_id = v_b
    AND COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(listing_kind, '') = COALESCE(p_listing_kind, '');

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (user_a_id, user_b_id, listing_id, listing_kind)
    VALUES (v_a, v_b, p_listing_id, p_listing_kind)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) TO authenticated;

-- =============================================================
-- saved_listings
-- =============================================================
CREATE TABLE IF NOT EXISTS public.saved_listings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_kind text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, listing_id, listing_kind)
);

CREATE INDEX IF NOT EXISTS saved_listings_user_idx
  ON public.saved_listings(user_id, created_at DESC);

ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own saves" ON public.saved_listings;
CREATE POLICY "Owner reads own saves"
  ON public.saved_listings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner inserts own saves" ON public.saved_listings;
CREATE POLICY "Owner inserts own saves"
  ON public.saved_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner deletes own saves" ON public.saved_listings;
CREATE POLICY "Owner deletes own saves"
  ON public.saved_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================
-- scout_requests
-- =============================================================
CREATE TABLE IF NOT EXISTS public.scout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_kind text NOT NULL,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  -- Length cap defends against payload-bloat abuse; mirrored on the client.
  message text DEFAULT '' CHECK (char_length(message) <= 2000),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT scout_requests_distinct CHECK (requester_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS scout_requests_seller_idx
  ON public.scout_requests(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scout_requests_requester_idx
  ON public.scout_requests(requester_id, created_at DESC);

ALTER TABLE public.scout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read scout request" ON public.scout_requests;
CREATE POLICY "Participants read scout request"
  ON public.scout_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "Requester creates scout request" ON public.scout_requests;
CREATE POLICY "Requester creates scout request"
  ON public.scout_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Seller updates scout request" ON public.scout_requests;
CREATE POLICY "Seller updates scout request"
  ON public.scout_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = requester_id)
  WITH CHECK (auth.uid() = seller_id OR auth.uid() = requester_id);

-- =============================================================
-- legacy backfill: stitch existing 1:1 messages into conversations
--
-- Constraints we lean on:
--   * The `messages` table prior to this migration had NO listing_id /
--     listing_kind columns, so every existing row is listing-agnostic by
--     definition. Collapsing per-pair into a single listing-NULL
--     conversation is therefore correct, not lossy.
--   * The WHERE clause explicitly restricts to rows that still have NULL
--     listing context. If a future migration adds listing-scoped legacy
--     rows, they will NOT be touched by this block.
--   * Conversation lookup uses `ORDER BY created_at LIMIT 1` so we always
--     reuse the same row when the partial-unique index admits more than
--     one historical (a,b,NULL,NULL) row (defensive — the index should
--     prevent that, but the back-fill must not crash if it ever happens).
-- =============================================================
DO $$
DECLARE
  r record;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT
      LEAST(sender_id, receiver_id) AS a,
      GREATEST(sender_id, receiver_id) AS b
    FROM public.messages
    WHERE conversation_id IS NULL
      AND listing_id IS NULL
      AND listing_kind IS NULL
  LOOP
    SELECT id INTO v_id FROM public.conversations
    WHERE user_a_id = r.a
      AND user_b_id = r.b
      AND listing_id IS NULL
      AND listing_kind IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.conversations (user_a_id, user_b_id)
      VALUES (r.a, r.b)
      RETURNING id INTO v_id;
    END IF;

    UPDATE public.messages
    SET conversation_id = v_id
    WHERE conversation_id IS NULL
      AND listing_id IS NULL
      AND listing_kind IS NULL
      AND LEAST(sender_id, receiver_id) = r.a
      AND GREATEST(sender_id, receiver_id) = r.b;
  END LOOP;
END$$;


-- =====================================================================
-- PHASE 9 — Trust, Retention, Polish (auto-appended from migration)
-- =====================================================================

-- =============================================================
-- PHASE 9 — Trust, Retention, Polish
-- =============================================================
-- Adds the platform-quality groundwork:
--   * scout_applications  — users applying for the Verified Scout badge
--   * user_blocks         — one user hides another from feeds/messages
--   * listing_views       — per-(user OR ip) per-day deduped view rows
--   * track_listing_view  — RPC: dedupes & upserts a view row
--   * helper engagement view + counter helpers
--
-- Everything is RLS-gated. Admin overrides go through `is_admin()`.
-- =============================================================

-- 1. scout_applications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scout_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','declined','withdrawn')),
  pitch         text DEFAULT '' CHECK (char_length(pitch) <= 2000),
  region        text DEFAULT '',
  specialties   text[] DEFAULT '{}',
  reviewer_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text DEFAULT '' CHECK (char_length(reviewer_note) <= 2000),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- One open application at a time per user. Closed (declined/withdrawn) rows
-- are kept for audit and don't block a fresh submission.
CREATE UNIQUE INDEX IF NOT EXISTS scout_applications_one_open
  ON public.scout_applications (applicant_id)
  WHERE status IN ('pending','approved');

ALTER TABLE public.scout_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_apps_select ON public.scout_applications;
CREATE POLICY scout_apps_select ON public.scout_applications
  FOR SELECT TO authenticated
  USING (auth.uid() = applicant_id OR public.is_admin());

DROP POLICY IF EXISTS scout_apps_insert ON public.scout_applications;
CREATE POLICY scout_apps_insert ON public.scout_applications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS scout_apps_update ON public.scout_applications;
DROP POLICY IF EXISTS scout_apps_update_self ON public.scout_applications;
DROP POLICY IF EXISTS scout_apps_update_admin ON public.scout_applications;

-- Applicant: may edit their own *pending* row, and may only transition
-- it to `withdrawn`. They cannot self-promote to `approved`.
CREATE POLICY scout_apps_update_self ON public.scout_applications
  FOR UPDATE TO authenticated
  USING (auth.uid() = applicant_id AND status = 'pending')
  WITH CHECK (
    auth.uid() = applicant_id
    AND status IN ('pending','withdrawn')
  );

-- Admin: full review surface.
CREATE POLICY scout_apps_update_admin ON public.scout_applications
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Defense-in-depth trigger — rejects forbidden transitions independent
-- of policy wording.
CREATE OR REPLACE FUNCTION public.guard_scout_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS DISTINCT FROM OLD.applicant_id THEN
    RAISE EXCEPTION 'scout_applications: not your application';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'scout_applications: row is closed';
  END IF;
  IF NEW.status NOT IN ('pending','withdrawn') THEN
    RAISE EXCEPTION 'scout_applications: applicants may only withdraw';
  END IF;
  IF NEW.reviewer_id    IS DISTINCT FROM OLD.reviewer_id
  OR NEW.reviewer_note  IS DISTINCT FROM OLD.reviewer_note
  OR NEW.applicant_id   IS DISTINCT FROM OLD.applicant_id THEN
    RAISE EXCEPTION 'scout_applications: forbidden column change';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_guard ON public.scout_applications;
CREATE TRIGGER scout_apps_guard
  BEFORE UPDATE ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_scout_application_update();

-- 2. user_blocks -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_distinct CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx
  ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select ON public.user_blocks;
CREATE POLICY user_blocks_select ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id OR public.is_admin());

DROP POLICY IF EXISTS user_blocks_insert ON public.user_blocks;
CREATE POLICY user_blocks_insert ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_delete ON public.user_blocks;
CREATE POLICY user_blocks_delete ON public.user_blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- 3. listing_views ---------------------------------------------------------
-- We dedupe per (listing, kind, viewer_id, viewed_day) so refresh-spam
-- doesn't inflate counts. Anonymous viewers don't write rows in V1.
CREATE TABLE IF NOT EXISTS public.listing_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL,
  listing_kind  text NOT NULL
                  CHECK (listing_kind IN ('marketplace','community_post','external_listing')),
  viewer_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_day    date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_views_dedup
  ON public.listing_views (listing_id, listing_kind, viewer_id, viewed_day)
  WHERE viewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS listing_views_listing_idx
  ON public.listing_views (listing_kind, listing_id);

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

-- Reads: anyone signed in can read counts via aggregate queries; row-level
-- access stays restricted to the viewer themselves + admins.
DROP POLICY IF EXISTS listing_views_select ON public.listing_views;
CREATE POLICY listing_views_select ON public.listing_views
  FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id OR public.is_admin());

-- Direct inserts are blocked — all writes flow through `track_listing_view`,
-- which is SECURITY DEFINER and enforces dedup + admin-bypass safely.
-- (No INSERT policy => deny by default.)

-- 4. track_listing_view RPC -----------------------------------------------
CREATE OR REPLACE FUNCTION public.track_listing_view(
  p_listing_id   uuid,
  p_listing_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- Anonymous views are ignored in V1.
    RETURN;
  END IF;
  IF p_listing_kind NOT IN ('marketplace','community_post','external_listing') THEN
    RAISE EXCEPTION 'invalid listing_kind %', p_listing_kind;
  END IF;

  INSERT INTO public.listing_views (listing_id, listing_kind, viewer_id)
  VALUES (p_listing_id, p_listing_kind, v_uid)
  ON CONFLICT (listing_id, listing_kind, viewer_id, viewed_day)
    WHERE viewer_id IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.track_listing_view(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_listing_view(uuid, text) TO authenticated;

-- 5. listing_view_counts view ---------------------------------------------
-- Exposes a deduped count per listing for use by `select` on the frontend.
CREATE OR REPLACE VIEW public.listing_view_counts AS
SELECT
  listing_id,
  listing_kind,
  count(*)::int AS view_count
FROM public.listing_views
GROUP BY listing_id, listing_kind;

GRANT SELECT ON public.listing_view_counts TO authenticated;

-- 6. listing_save_counts view ---------------------------------------------
-- Mirror for saved_listings so the detail page can render "N saves" without
-- granting broad SELECT on saved_listings.
CREATE OR REPLACE VIEW public.listing_save_counts AS
SELECT
  listing_id,
  listing_kind,
  count(*)::int AS save_count
FROM public.saved_listings
GROUP BY listing_id, listing_kind;

GRANT SELECT ON public.listing_save_counts TO authenticated;

-- 7. notify_user allow-list expansion -------------------------------------
-- The PHASE 8 RPC only allowed (follow, message, scout_response,
-- listing_saved, listing_shared). PHASE 9 adds:
--   * scout_request         — seller is told a scout has been requested
--   * scout_application     — admin notification when a user applies
--   * reputation_milestone  — first listing, first sale, etc.
DROP FUNCTION IF EXISTS public.notify_user(uuid, text, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.notify_user(
  p_target uuid,
  p_type text,
  p_title text,
  p_content text DEFAULT '',
  p_related_item_id text DEFAULT NULL,
  p_related_item_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'p_target is required';
  END IF;
  IF p_type NOT IN (
    'follow','message','scout_response','listing_saved','listing_shared',
    'scout_request','scout_application','reputation_milestone'
  ) THEN
    RAISE EXCEPTION 'notification type % is not allowed via notify_user', p_type;
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, content, actor_user_id,
    related_item_id, related_item_type, metadata
  )
  VALUES (
    p_target, p_type, p_title, COALESCE(p_content, ''),
    auth.uid(),
    NULLIF(p_related_item_id, '')::uuid,
    p_related_item_type,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, jsonb) TO authenticated;

-- 8. updated_at trigger for scout_applications ----------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_touch ON public.scout_applications;
CREATE TRIGGER scout_apps_touch
  BEFORE UPDATE ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9. Auto-approve trigger: when admin sets status='approved', flip the
--    profiles.scout_verified flag. Keeps the badge source-of-truth on
--    profiles (which feeds.* already join) while letting moderation live
--    in scout_applications.
CREATE OR REPLACE FUNCTION public.apply_scout_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles
       SET scout_verified = true
     WHERE id = NEW.applicant_id;
  ELSIF NEW.status IN ('declined','withdrawn')
        AND OLD.status = 'approved' THEN
    UPDATE public.profiles
       SET scout_verified = false
     WHERE id = NEW.applicant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scout_apps_sync_profile ON public.scout_applications;
CREATE TRIGGER scout_apps_sync_profile
  AFTER UPDATE OF status ON public.scout_applications
  FOR EACH ROW EXECUTE FUNCTION public.apply_scout_verification();
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260519000006 — community_posts.description column
-- Adds a long-form description field separate from the short `caption`
-- (title) so Flash Find uploads can store both without one overwriting
-- the other in the feed.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-05-19 (g) Security advisor hardening
-- ─────────────────────────────────────────────────────────────────────────────
-- Pins search_path on SECURITY DEFINER/mutating functions, revokes anon
-- EXECUTE on RPC mutators + trigger-only helpers, drops the broad
-- avatars listing policy (object URLs still resolve), and restricts
-- platform_submissions INSERT to authenticated users.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  sig text;
  targets text[] := ARRAY[
    'increment_following_count(uuid)',
    'decrement_following_count(uuid)',
    'increment_follower_count(uuid)',
    'decrement_follower_count(uuid)',
    'increment_post_likes(uuid)',
    'decrement_post_likes(uuid)',
    'validate_mission_progress()',
    'place_bid(uuid,numeric)',
    'prevent_profile_field_escalation()',
    'claim_ai_scan_slot(integer)',
    'get_my_exact_address(text,uuid)',
    'rls_auto_enable()'
  ];
BEGIN
  FOREACH sig IN ARRAY targets LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, pg_temp', sig);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END
$$;

DO $$
DECLARE
  sig text;
  mutating_rpcs text[] := ARRAY[
    'increment_following_count(uuid)',
    'decrement_following_count(uuid)',
    'increment_follower_count(uuid)',
    'decrement_follower_count(uuid)',
    'increment_post_likes(uuid)',
    'decrement_post_likes(uuid)',
    'place_bid(uuid,numeric)',
    'claim_ai_scan_slot(integer)',
    'get_my_exact_address(text,uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY mutating_rpcs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', sig);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END
$$;

DO $$
DECLARE
  sig text;
  trigger_helpers text[] := ARRAY[
    'prevent_profile_field_escalation()',
    'validate_mission_progress()',
    'rls_auto_enable()'
  ];
BEGIN
  FOREACH sig IN ARRAY trigger_helpers LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', sig);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can submit platforms" ON public.platform_submissions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_submissions'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Authenticated users can submit platforms" ON public.platform_submissions;
      CREATE POLICY "Authenticated users can submit platforms"
        ON public.platform_submissions
        FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $pol$;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-05-19 (h) Guest read access for Home feed + Live events
-- ─────────────────────────────────────────────────────────────────────────────
-- Lets signed-out (anon) visitors SELECT from the publicly-browsable
-- tables so the Home feed and Live Hub render for guests. Writes still
-- require auth. Safe to re-run.

DROP POLICY IF EXISTS "Anyone can view community posts" ON public.community_posts;
CREATE POLICY "Anyone can view community posts"
  ON public.community_posts FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can view active external listings" ON public.external_listings;
CREATE POLICY "Anyone can view active external listings"
  ON public.external_listings FOR SELECT
  TO anon, authenticated
  USING (COALESCE(status, 'active') = 'active');

DROP POLICY IF EXISTS "Anyone can view active marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Anyone can view active marketplace listings"
  ON public.marketplace_listings FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Anyone can view auctions" ON public.auctions;
CREATE POLICY "Anyone can view auctions"
  ON public.auctions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can view public profile fields" ON public.profiles;
CREATE POLICY "Anyone can view public profile fields"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);


-- -----------------------------------------------------------------------------
-- FROM: 20260520000001_storage_avatars_policy_harden.sql
-- -----------------------------------------------------------------------------
-- # Harden avatars-bucket storage policies
--
-- Symptom: brand-new users hit `403 new row violates row-level security
-- policy` when uploading a Flash Find photo, even though the upload path
-- (`<auth.uid()>/finds/<ts>.<ext>`) matches their auth.uid().
--
-- Root cause options the previous policy was vulnerable to:
--   * `storage.foldername(name)[1]` can return NULL on some path shapes
--     (e.g. a leading slash or unexpected encoding), tripping RLS.
--   * Older Supabase storage builds defined `storage.foldername` slightly
--     differently. Newer projects can fail silently against the same path
--     that worked on an older project.
--
-- This patch replaces the path check with a direct prefix match
-- (`name LIKE auth.uid()::text || '/%'`), which is robust to both edge
-- cases and reads more clearly. It also makes the bucket existence
-- idempotent and re-asserts the public SELECT policy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
-- =============================================================================
-- PHASE 1 — Seller-driven marketplace foundation
-- =============================================================================
-- Adds two account types (seeker / holder) and the minimum tables needed to
-- run a real local-events feed: events, featured items, saves, views, clicks.
--
-- Design notes
--   * Profiles get account_type defaulting to 'seeker' so every existing user
--     keeps the current experience. A holder is anyone who has flipped the
--     flag from the Profile page — we never force a picker.
--   * Events analytics clone the listing_views / track_listing_view pattern
--     (SECURITY DEFINER RPC + per-day dedupe + aggregate view). This keeps
--     the surface area small and the auth story identical.
--   * RLS: holders can only write their own events / featured items. Public
--     can read 'published' events. Saves/views/clicks readable only to the
--     row owner (or the holder, for analytics); writes go through RPCs.
-- =============================================================================

-- 1. profiles: account type + holder business fields -------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'seeker'
    CHECK (account_type IN ('seeker','holder')),
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_bio text,
  ADD COLUMN IF NOT EXISTS business_logo_url text;

CREATE INDEX IF NOT EXISTS profiles_account_type_idx
  ON public.profiles (account_type)
  WHERE account_type = 'holder';

-- 2. events ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  category         text NOT NULL DEFAULT 'estate_sale'
                     CHECK (category IN (
                       'estate_sale','yard_sale','flea_market','auction',
                       'pop_up','collectibles_show','other'
                     )),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  address          text,
  city             text,
  region           text,
  lat              double precision,
  lng              double precision,
  cover_image_url  text,
  cover_thumb_url  text,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_holder_idx       ON public.events (holder_id);
CREATE INDEX IF NOT EXISTS events_status_start_idx ON public.events (status, starts_at);
CREATE INDEX IF NOT EXISTS events_city_idx         ON public.events (city) WHERE status = 'published';

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_public ON public.events;
CREATE POLICY events_select_public ON public.events
  FOR SELECT TO authenticated, anon
  USING (status = 'published' OR auth.uid() = holder_id);

DROP POLICY IF EXISTS events_insert_own ON public.events;
CREATE POLICY events_insert_own ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = holder_id);

DROP POLICY IF EXISTS events_update_own ON public.events;
CREATE POLICY events_update_own ON public.events
  FOR UPDATE TO authenticated
  USING (auth.uid() = holder_id)
  WITH CHECK (auth.uid() = holder_id);

DROP POLICY IF EXISTS events_delete_own ON public.events;
CREATE POLICY events_delete_own ON public.events
  FOR DELETE TO authenticated
  USING (auth.uid() = holder_id);

-- 3. event_featured_items ---------------------------------------------------
-- Small gallery of "preview" items per event. Not a full marketplace listing
-- — just title + optional price + image. We cap at 12 client-side.
CREATE TABLE IF NOT EXISTS public.event_featured_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title       text NOT NULL,
  price       numeric(10,2),
  image_url   text,
  thumb_url   text,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_featured_items_event_idx
  ON public.event_featured_items (event_id, position);

ALTER TABLE public.event_featured_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_featured_items_select ON public.event_featured_items;
CREATE POLICY event_featured_items_select ON public.event_featured_items
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (e.status = 'published' OR e.holder_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS event_featured_items_write ON public.event_featured_items;
CREATE POLICY event_featured_items_write ON public.event_featured_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

-- 4. event_saves -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_saves (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_saves_event_idx ON public.event_saves (event_id);

ALTER TABLE public.event_saves ENABLE ROW LEVEL SECURITY;

-- Save rows are visible to (a) the saver, (b) the event holder (for analytics).
DROP POLICY IF EXISTS event_saves_select ON public.event_saves;
CREATE POLICY event_saves_select ON public.event_saves
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

DROP POLICY IF EXISTS event_saves_insert ON public.event_saves;
CREATE POLICY event_saves_insert ON public.event_saves
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS event_saves_delete ON public.event_saves;
CREATE POLICY event_saves_delete ON public.event_saves
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. event_views + RPC ------------------------------------------------------
-- Dedupes per (event, viewer, day). Anonymous views ignored in V1.
CREATE TABLE IF NOT EXISTS public.event_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  viewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_views_dedup
  ON public.event_views (event_id, viewer_id, viewed_day)
  WHERE viewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_views_event_idx ON public.event_views (event_id);

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

-- Holder can read their own event's view rows; viewer can read their own.
DROP POLICY IF EXISTS event_views_select ON public.event_views;
CREATE POLICY event_views_select ON public.event_views
  FOR SELECT TO authenticated
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );
-- No INSERT policy → writes only via the SECURITY DEFINER RPC below.

CREATE OR REPLACE FUNCTION public.track_event_view(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN; -- anonymous views ignored in V1
  END IF;
  INSERT INTO public.event_views (event_id, viewer_id)
  VALUES (p_event_id, v_uid)
  ON CONFLICT (event_id, viewer_id, viewed_day)
    WHERE viewer_id IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.track_event_view(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_event_view(uuid) TO authenticated;

-- 6. event_clicks + RPC -----------------------------------------------------
-- Logs taps on holder-defined CTAs (directions, featured item, contact). We
-- only need totals for the analytics dashboard so no dedupe.
CREATE TABLE IF NOT EXISTS public.event_clicks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  clicker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  click_kind text NOT NULL CHECK (click_kind IN ('directions','featured_item','contact','share')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_clicks_event_idx ON public.event_clicks (event_id, click_kind);

ALTER TABLE public.event_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_clicks_select ON public.event_clicks;
CREATE POLICY event_clicks_select ON public.event_clicks
  FOR SELECT TO authenticated
  USING (
    auth.uid() = clicker_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.holder_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.track_event_click(p_event_id uuid, p_click_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF p_click_kind NOT IN ('directions','featured_item','contact','share') THEN
    RAISE EXCEPTION 'invalid click_kind %', p_click_kind;
  END IF;
  INSERT INTO public.event_clicks (event_id, clicker_id, click_kind)
  VALUES (p_event_id, v_uid, p_click_kind);
END;
$$;

REVOKE ALL ON FUNCTION public.track_event_click(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.track_event_click(uuid, text) TO authenticated;

-- 7. Aggregate views for the analytics dashboard ---------------------------
CREATE OR REPLACE VIEW public.event_view_counts AS
SELECT event_id, count(*)::int AS view_count
FROM public.event_views
GROUP BY event_id;

CREATE OR REPLACE VIEW public.event_save_counts AS
SELECT event_id, count(*)::int AS save_count
FROM public.event_saves
GROUP BY event_id;

CREATE OR REPLACE VIEW public.event_click_counts AS
SELECT event_id, click_kind, count(*)::int AS click_count
FROM public.event_clicks
GROUP BY event_id, click_kind;

GRANT SELECT ON public.event_view_counts  TO authenticated;
GRANT SELECT ON public.event_save_counts  TO authenticated;
GRANT SELECT ON public.event_click_counts TO authenticated;

-- 8. updated_at trigger for events -----------------------------------------
CREATE OR REPLACE FUNCTION public.events_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_updated_at();
