-- Add personal_records table for tracking PRs
-- Migration to support personal record tracking

CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  workout_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prs_user_exercise ON personal_records(user_id, exercise_name);
CREATE INDEX IF NOT EXISTS idx_prs_workout ON personal_records(workout_id);
