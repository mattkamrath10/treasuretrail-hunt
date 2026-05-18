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
    CREATE POLICY "Anyone authenticated can view community posts"
      ON community_posts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can create own posts') THEN
    CREATE POLICY "Users can create own posts"
      ON community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can update own posts') THEN
    CREATE POLICY "Users can update own posts"
      ON community_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_posts' AND policyname = 'Users can delete own posts') THEN
    CREATE POLICY "Users can delete own posts"
      ON community_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_posts_marketplace ON community_posts(marketplace_found);
CREATE INDEX IF NOT EXISTS idx_community_posts_user        ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created     ON community_posts(created_at DESC);

NOTIFY pgrst, 'reload schema';
