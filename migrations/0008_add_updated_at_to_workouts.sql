-- Add updated_at column to workouts for optimistic locking
ALTER TABLE workouts ADD COLUMN updated_at INTEGER;

-- Backfill existing rows with created_at
UPDATE workouts SET updated_at = created_at WHERE updated_at IS NULL;
