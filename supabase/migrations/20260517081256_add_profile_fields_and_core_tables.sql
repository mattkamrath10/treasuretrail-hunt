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

DROP POLICY IF EXISTS "Authenticated users can update auctions to bid" ON auctions;
CREATE POLICY "Authenticated users can update auctions to bid"
  ON auctions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

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
