-- Add completed column to sets table to track individual set completion
ALTER TABLE sets ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
