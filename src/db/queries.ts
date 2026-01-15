import type {
  WorkoutRow,
  WorkoutExerciseRow,
  SetRow,
  CustomExerciseRow,
  Workout,
  WorkoutExercise,
  Set,
  CustomExercise,
  CreateWorkoutRequest,
  CreateExerciseRequest,
  UserRow,
  User,
  PersonalRecord,
  PersonalRecordRow,
} from '../types';

function generateId(): string {
  return crypto.randomUUID();
}

// ==================== USERS ====================

export async function getUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE username = ?')
    .bind(username)
    .first<UserRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
  };
}

export async function createUser(db: D1Database, username: string, passwordHash: string): Promise<User> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, username, passwordHash, now)
    .run();

  // Seed default exercises for the new user
  await seedDefaultExercises(db, id);

  return {
    id,
    username,
    created_at: now,
  };
}

// Default exercises to seed for new users (sparse but covers main movements)
const DEFAULT_EXERCISES: Array<{ name: string; type: string; category: string; unit: string }> = [
  // Push
  { name: 'Bench Press', type: '+bar', category: 'Chest', unit: 'lbs' },
  { name: 'Overhead Press', type: '+bar', category: 'Shoulders', unit: 'lbs' },
  { name: 'Tricep Pushdown', type: 'total', category: 'Triceps', unit: 'lbs' },
  // Pull
  { name: 'Deadlift', type: '+bar', category: 'Back', unit: 'lbs' },
  { name: 'Barbell Row', type: '+bar', category: 'Back', unit: 'lbs' },
  { name: 'Lat Pulldown', type: 'total', category: 'Back', unit: 'lbs' },
  { name: 'Pull-ups', type: 'bodyweight', category: 'Back', unit: 'lbs' },
  { name: 'Barbell Curl', type: 'total', category: 'Biceps', unit: 'lbs' },
  // Legs
  { name: 'Squat', type: '+bar', category: 'Legs', unit: 'lbs' },
  { name: 'Leg Press', type: 'total', category: 'Legs', unit: 'lbs' },
  { name: 'Romanian Deadlift', type: '+bar', category: 'Legs', unit: 'lbs' },
];

async function seedDefaultExercises(db: D1Database, userId: string): Promise<void> {
  const now = Date.now();

  for (const exercise of DEFAULT_EXERCISES) {
    await db
      .prepare('INSERT INTO custom_exercises (id, user_id, name, type, category, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(generateId(), userId, exercise.name, exercise.type, exercise.category, exercise.unit, now)
      .run();
  }
}

// ==================== WORKOUTS ====================

export async function getAllWorkouts(db: D1Database, userId: string): Promise<Workout[]> {
  const workoutRows = await db
    .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY start_time DESC')
    .bind(userId)
    .all<WorkoutRow>();

  const workouts: Workout[] = [];

  for (const row of workoutRows.results) {
    const exercises = await getWorkoutExercises(db, row.id);
    workouts.push({
      id: row.id,
      user_id: row.user_id,
      start_time: row.start_time,
      end_time: row.end_time ?? undefined,
      exercises,
      created_at: row.created_at,
    });
  }

  return workouts;
}

export async function getWorkout(db: D1Database, id: string, userId: string): Promise<Workout | null> {
  const row = await db
    .prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<WorkoutRow>();

  if (!row) return null;

  const exercises = await getWorkoutExercises(db, id);

  return {
    id: row.id,
    user_id: row.user_id,
    start_time: row.start_time,
    end_time: row.end_time ?? undefined,
    exercises,
    created_at: row.created_at,
  };
}

async function getWorkoutExercises(db: D1Database, workoutId: string): Promise<WorkoutExercise[]> {
  const exerciseRows = await db
    .prepare('SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position')
    .bind(workoutId)
    .all<WorkoutExerciseRow>();

  // Get PRs for this workout
  const prs = await getPRsForWorkout(db, workoutId);

  const exercises: WorkoutExercise[] = [];

  for (const exRow of exerciseRows.results) {
    const setRows = await db
      .prepare('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position')
      .bind(exRow.id)
      .all<SetRow>();

    const sets: Set[] = setRows.results.map((s, index) => {
      // Check if this set is a PR
      const isPR = prs.some(pr =>
        pr.exercise_name === exRow.exercise_name &&
        pr.set_index === index &&
        pr.weight === s.weight &&
        pr.reps === s.reps
      );

      return {
        weight: s.weight,
        reps: s.reps,
        note: s.note ?? undefined,
        isPR,
        completed: s.completed === 1,
      };
    });

    exercises.push({
      name: exRow.exercise_name,
      sets,
      completed: exRow.completed === 1,
    });
  }

  return exercises;
}

export async function createWorkout(db: D1Database, userId: string, data: CreateWorkoutRequest): Promise<Workout> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare('INSERT INTO workouts (id, user_id, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, data.start_time, data.end_time !== undefined ? data.end_time : null, now)
    .run();

  // Insert exercises and sets
  for (let i = 0; i < data.exercises.length; i++) {
    const ex = data.exercises[i];
    const exId = generateId();

    await db
      .prepare('INSERT INTO workout_exercises (id, workout_id, exercise_name, position, completed) VALUES (?, ?, ?, ?, ?)')
      .bind(exId, id, ex.name, i, ex.completed ? 1 : 0)
      .run();

    for (let j = 0; j < ex.sets.length; j++) {
      const set = ex.sets[j];
      await db
        .prepare('INSERT INTO sets (id, workout_exercise_id, weight, reps, note, position, completed) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), exId, set.weight, set.reps, set.note ?? null, j, set.completed === true ? 1 : 0)
        .run();
    }
  }

  // Detect and record PRs
  await detectAndRecordPRs(db, userId, id, data.exercises, data.start_time);

  return getWorkout(db, id, userId) as Promise<Workout>;
}

export async function updateWorkout(db: D1Database, id: string, userId: string, data: CreateWorkoutRequest): Promise<Workout | null> {
  const existing = await getWorkout(db, id, userId);
  if (!existing) return null;

  // Update workout row
  await db
    .prepare('UPDATE workouts SET start_time = ?, end_time = ? WHERE id = ?')
    .bind(data.start_time, data.end_time ?? null, id)
    .run();

  // Delete existing exercises, sets, and PRs for this workout
  await db
    .prepare('DELETE FROM workout_exercises WHERE workout_id = ?')
    .bind(id)
    .run();

  await db
    .prepare('DELETE FROM personal_records WHERE workout_id = ?')
    .bind(id)
    .run();

  // Re-insert exercises and sets
  for (let i = 0; i < data.exercises.length; i++) {
    const ex = data.exercises[i];
    const exId = generateId();

    await db
      .prepare('INSERT INTO workout_exercises (id, workout_id, exercise_name, position, completed) VALUES (?, ?, ?, ?, ?)')
      .bind(exId, id, ex.name, i, ex.completed ? 1 : 0)
      .run();

    for (let j = 0; j < ex.sets.length; j++) {
      const set = ex.sets[j];
      await db
        .prepare('INSERT INTO sets (id, workout_exercise_id, weight, reps, note, position, completed) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(generateId(), exId, set.weight, set.reps, set.note ?? null, j, set.completed === true ? 1 : 0)
        .run();
    }
  }

  // Detect and record PRs
  await detectAndRecordPRs(db, userId, id, data.exercises, data.start_time);

  return getWorkout(db, id, userId);
}

export async function deleteWorkout(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return result.meta.changes > 0;
}

// ==================== CUSTOM EXERCISES ====================

export async function getAllCustomExercises(db: D1Database, userId: string): Promise<CustomExercise[]> {
  const rows = await db
    .prepare('SELECT * FROM custom_exercises WHERE user_id = ? ORDER BY name')
    .bind(userId)
    .all<CustomExerciseRow>();

  return rows.results.map(row => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type as CustomExercise['type'],
    category: row.category as CustomExercise['category'],
    unit: row.unit as CustomExercise['unit'],
    created_at: row.created_at,
  }));
}

export async function getCustomExercise(db: D1Database, id: string, userId: string): Promise<CustomExercise | null> {
  const row = await db
    .prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<CustomExerciseRow>();

  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type as CustomExercise['type'],
    category: row.category as CustomExercise['category'],
    unit: row.unit as CustomExercise['unit'],
    created_at: row.created_at,
  };
}

export async function createCustomExercise(db: D1Database, userId: string, data: CreateExerciseRequest): Promise<CustomExercise> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare('INSERT INTO custom_exercises (id, user_id, name, type, category, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, userId, data.name, data.type, data.category, data.unit, now)
    .run();

  return {
    id,
    user_id: userId,
    name: data.name,
    type: data.type,
    category: data.category,
    unit: data.unit,
    created_at: now,
  };
}

export async function updateCustomExercise(db: D1Database, id: string, userId: string, data: CreateExerciseRequest): Promise<CustomExercise | null> {
  const existing = await getCustomExercise(db, id, userId);
  if (!existing) return null;

  const oldName = existing.name;
  const newName = data.name;

  // Update the custom exercise
  await db
    .prepare('UPDATE custom_exercises SET name = ?, type = ?, category = ?, unit = ? WHERE id = ?')
    .bind(newName, data.type, data.category, data.unit, id)
    .run();

  // If the name changed, sync it across all workout_exercises and personal_records
  if (oldName !== newName) {
    // Update all workout_exercises that reference the old name
    await db
      .prepare(`
        UPDATE workout_exercises
        SET exercise_name = ?
        WHERE exercise_name = ?
          AND workout_id IN (SELECT id FROM workouts WHERE user_id = ?)
      `)
      .bind(newName, oldName, userId)
      .run();

    // Update all personal_records that reference the old name
    await db
      .prepare('UPDATE personal_records SET exercise_name = ? WHERE exercise_name = ? AND user_id = ?')
      .bind(newName, oldName, userId)
      .run();
  }

  return getCustomExercise(db, id, userId);
}

export async function deleteCustomExercise(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM custom_exercises WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return result.meta.changes > 0;
}

// ==================== PERSONAL RECORDS ====================

export async function getPRsForExercise(db: D1Database, userId: string, exerciseName: string): Promise<PersonalRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM personal_records WHERE user_id = ? AND exercise_name = ? ORDER BY achieved_at DESC')
    .bind(userId, exerciseName)
    .all<PersonalRecordRow>();

  return rows.results.map(row => ({
    id: row.id,
    user_id: row.user_id,
    exercise_name: row.exercise_name,
    weight: row.weight,
    reps: row.reps,
    workout_id: row.workout_id,
    set_index: row.set_index,
    achieved_at: row.achieved_at,
  }));
}

export async function getPRsForWorkout(db: D1Database, workoutId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM personal_records WHERE workout_id = ?')
    .bind(workoutId)
    .all<PersonalRecordRow>();

  return rows.results.map(row => ({
    id: row.id,
    user_id: row.user_id,
    exercise_name: row.exercise_name,
    weight: row.weight,
    reps: row.reps,
    workout_id: row.workout_id,
    set_index: row.set_index,
    achieved_at: row.achieved_at,
  }));
}

export async function getAllPRs(db: D1Database, userId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM personal_records WHERE user_id = ? ORDER BY achieved_at DESC')
    .bind(userId)
    .all<PersonalRecordRow>();

  return rows.results.map(row => ({
    id: row.id,
    user_id: row.user_id,
    exercise_name: row.exercise_name,
    weight: row.weight,
    reps: row.reps,
    workout_id: row.workout_id,
    set_index: row.set_index,
    achieved_at: row.achieved_at,
  }));
}

async function detectAndRecordPRs(db: D1Database, userId: string, workoutId: string, exercises: WorkoutExercise[], startTime: number): Promise<void> {
  // Track the best reps at each weight for each exercise within this workout
  const currentWorkoutBests = new Map<string, Map<number, number>>(); // exerciseName -> (weight -> maxReps)

  // For each exercise, check if any sets are PRs
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
    const exercise = exercises[exerciseIndex];

    // Initialize tracking for this exercise if not already done
    if (!currentWorkoutBests.has(exercise.name)) {
      currentWorkoutBests.set(exercise.name, new Map());
    }
    const exerciseBests = currentWorkoutBests.get(exercise.name)!;

    for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
      const set = exercise.sets[setIndex];

      // Skip sets that are explicitly marked as incomplete
      // Treat undefined/null as completed for backward compatibility
      if (set.completed === false) {
        continue;
      }

      // Check if this weight+reps combo is a PR
      // A PR is when at this weight, the reps are higher than any previous workout
      // Only consider previously completed sets (treat NULL as completed for backward compatibility)
      const previousBest = await db
        .prepare(`
          SELECT MAX(s.reps) as max_reps
          FROM sets s
          JOIN workout_exercises we ON s.workout_exercise_id = we.id
          JOIN workouts w ON we.workout_id = w.id
          WHERE w.user_id = ?
            AND we.exercise_name = ?
            AND s.weight = ?
            AND w.start_time < ?
            AND (s.completed = 1 OR s.completed IS NULL)
        `)
        .bind(userId, exercise.name, set.weight, startTime)
        .first<{ max_reps: number | null }>();

      // Check current workout best for this weight (from earlier sets in this workout)
      const currentWorkoutBest = exerciseBests.get(set.weight);

      // Determine the maximum reps to beat
      const previousMax = previousBest?.max_reps ?? null;
      let maxToBeat: number | null = null;

      if (previousMax !== null && currentWorkoutBest !== undefined) {
        maxToBeat = Math.max(previousMax, currentWorkoutBest);
      } else if (previousMax !== null) {
        maxToBeat = previousMax;
      } else if (currentWorkoutBest !== undefined) {
        maxToBeat = currentWorkoutBest;
      }

      const isPR = maxToBeat === null || set.reps > maxToBeat;

      if (isPR) {
        // Record this as a PR
        await db
          .prepare('INSERT INTO personal_records (id, user_id, exercise_name, weight, reps, workout_id, set_index, achieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(generateId(), userId, exercise.name, set.weight, set.reps, workoutId, setIndex, startTime)
          .run();
      }

      // Update the current workout best for this weight
      const currentBest = exerciseBests.get(set.weight);
      if (currentBest === undefined || set.reps > currentBest) {
        exerciseBests.set(set.weight, set.reps);
      }
    }
  }
}

// ==================== DATA MANAGEMENT ====================

export async function clearAllData(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM workouts WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM custom_exercises WHERE user_id = ?').bind(userId).run();
  await db.prepare('DELETE FROM personal_records WHERE user_id = ?').bind(userId).run();
}
