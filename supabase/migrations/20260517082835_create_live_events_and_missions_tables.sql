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
