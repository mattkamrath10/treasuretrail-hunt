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
