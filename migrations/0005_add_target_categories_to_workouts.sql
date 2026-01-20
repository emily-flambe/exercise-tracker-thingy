-- Add target_categories column to workouts table
-- This stores the muscle categories the user wants to focus on (JSON array as TEXT)
ALTER TABLE workouts ADD COLUMN target_categories TEXT;
