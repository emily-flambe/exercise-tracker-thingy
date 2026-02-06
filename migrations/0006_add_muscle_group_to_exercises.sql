-- Add muscle_group column to custom_exercises table
ALTER TABLE custom_exercises ADD COLUMN muscle_group TEXT NOT NULL DEFAULT 'Other';
