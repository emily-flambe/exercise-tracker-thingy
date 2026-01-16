-- Add index on exercise_name for faster exercise name updates
CREATE INDEX IF NOT EXISTS idx_workout_exercises_name ON workout_exercises(exercise_name);
