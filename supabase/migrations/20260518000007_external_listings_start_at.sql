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
