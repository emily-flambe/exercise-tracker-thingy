-- Add soft delete support for custom exercises
-- Instead of permanently deleting exercises, we flip this flag
ALTER TABLE custom_exercises ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_exercises ADD COLUMN deleted_at INTEGER;
