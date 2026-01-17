-- Add missed column to sets table to track missed sets
-- Missed sets can be marked completed but should not count towards PRs
ALTER TABLE sets ADD COLUMN missed INTEGER NOT NULL DEFAULT 0;
