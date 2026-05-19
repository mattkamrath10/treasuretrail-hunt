-- Add a real description column to community_posts so Flash Find uploads
-- can persist a long-form body separate from the short `caption` (title).
-- Prior to this, the upload pipeline was overwriting `caption` with the
-- description text, which made the feed card title unreadable.

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS description text DEFAULT '';
