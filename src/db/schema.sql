-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Custom exercises (user-created or overrides of defaults)
CREATE TABLE IF NOT EXISTS custom_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('total', '/side', '+bar', 'bodyweight')),
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'lbs' CHECK (unit IN ('lbs', 'kg')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for looking up exercises by user
CREATE INDEX IF NOT EXISTS idx_custom_exercises_user ON custom_exercises(user_id);

-- Workouts
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for looking up workouts by user, ordered by time
CREATE INDEX IF NOT EXISTS idx_workouts_user_time ON workouts(user_id, start_time DESC);

-- Workout exercises (which exercises are in a workout)
CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

-- Index for looking up exercises in a workout
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);

-- Sets (individual sets within a workout exercise)
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL,
  note TEXT,
  position INTEGER NOT NULL,
  FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
);

-- Index for looking up sets in a workout exercise
CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise ON sets(workout_exercise_id);

-- Personal records (PRs) for tracking best performances
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

-- Index for looking up PRs by user and exercise
CREATE INDEX IF NOT EXISTS idx_prs_user_exercise ON personal_records(user_id, exercise_name);

-- Index for looking up PRs by workout (to show stars in workout view)
CREATE INDEX IF NOT EXISTS idx_prs_workout ON personal_records(workout_id);

