-- Add completed column to workout_exercises table
-- Migration to support exercise checkmark feature
ALTER TABLE workout_exercises ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;
