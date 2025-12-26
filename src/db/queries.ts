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
} from '../types';

const DEFAULT_USER_ID = 'default';

function generateId(): string {
  return crypto.randomUUID();
}

// ==================== WORKOUTS ====================

export async function getAllWorkouts(db: D1Database): Promise<Workout[]> {
  const workoutRows = await db
    .prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY start_time DESC')
    .bind(DEFAULT_USER_ID)
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

export async function getWorkout(db: D1Database, id: string): Promise<Workout | null> {
  const row = await db
    .prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
    .bind(id, DEFAULT_USER_ID)
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

  const exercises: WorkoutExercise[] = [];

  for (const exRow of exerciseRows.results) {
    const setRows = await db
      .prepare('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position')
      .bind(exRow.id)
      .all<SetRow>();

    const sets: Set[] = setRows.results.map(s => ({
      weight: s.weight,
      reps: s.reps,
      note: s.note ?? undefined,
    }));

    exercises.push({
      name: exRow.exercise_name,
      sets,
    });
  }

  return exercises;
}

export async function createWorkout(db: D1Database, data: CreateWorkoutRequest): Promise<Workout> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare('INSERT INTO workouts (id, user_id, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, DEFAULT_USER_ID, data.start_time, data.end_time ?? null, now)
    .run();

  // Insert exercises and sets
  for (let i = 0; i < data.exercises.length; i++) {
    const ex = data.exercises[i];
    const exId = generateId();

    await db
      .prepare('INSERT INTO workout_exercises (id, workout_id, exercise_name, position) VALUES (?, ?, ?, ?)')
      .bind(exId, id, ex.name, i)
      .run();

    for (let j = 0; j < ex.sets.length; j++) {
      const set = ex.sets[j];
      await db
        .prepare('INSERT INTO sets (id, workout_exercise_id, weight, reps, note, position) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(generateId(), exId, set.weight, set.reps, set.note ?? null, j)
        .run();
    }
  }

  return {
    id,
    user_id: DEFAULT_USER_ID,
    start_time: data.start_time,
    end_time: data.end_time,
    exercises: data.exercises,
    created_at: now,
  };
}

export async function updateWorkout(db: D1Database, id: string, data: CreateWorkoutRequest): Promise<Workout | null> {
  const existing = await getWorkout(db, id);
  if (!existing) return null;

  // Update workout row
  await db
    .prepare('UPDATE workouts SET start_time = ?, end_time = ? WHERE id = ?')
    .bind(data.start_time, data.end_time ?? null, id)
    .run();

  // Delete existing exercises and sets (cascade will handle sets)
  await db
    .prepare('DELETE FROM workout_exercises WHERE workout_id = ?')
    .bind(id)
    .run();

  // Re-insert exercises and sets
  for (let i = 0; i < data.exercises.length; i++) {
    const ex = data.exercises[i];
    const exId = generateId();

    await db
      .prepare('INSERT INTO workout_exercises (id, workout_id, exercise_name, position) VALUES (?, ?, ?, ?)')
      .bind(exId, id, ex.name, i)
      .run();

    for (let j = 0; j < ex.sets.length; j++) {
      const set = ex.sets[j];
      await db
        .prepare('INSERT INTO sets (id, workout_exercise_id, weight, reps, note, position) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(generateId(), exId, set.weight, set.reps, set.note ?? null, j)
        .run();
    }
  }

  return getWorkout(db, id);
}

export async function deleteWorkout(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?')
    .bind(id, DEFAULT_USER_ID)
    .run();

  return result.meta.changes > 0;
}

// ==================== CUSTOM EXERCISES ====================

export async function getAllCustomExercises(db: D1Database): Promise<CustomExercise[]> {
  const rows = await db
    .prepare('SELECT * FROM custom_exercises WHERE user_id = ? ORDER BY name')
    .bind(DEFAULT_USER_ID)
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

export async function getCustomExercise(db: D1Database, id: string): Promise<CustomExercise | null> {
  const row = await db
    .prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ?')
    .bind(id, DEFAULT_USER_ID)
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

export async function createCustomExercise(db: D1Database, data: CreateExerciseRequest): Promise<CustomExercise> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare('INSERT INTO custom_exercises (id, user_id, name, type, category, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, DEFAULT_USER_ID, data.name, data.type, data.category, data.unit, now)
    .run();

  return {
    id,
    user_id: DEFAULT_USER_ID,
    name: data.name,
    type: data.type,
    category: data.category,
    unit: data.unit,
    created_at: now,
  };
}

export async function updateCustomExercise(db: D1Database, id: string, data: CreateExerciseRequest): Promise<CustomExercise | null> {
  const existing = await getCustomExercise(db, id);
  if (!existing) return null;

  await db
    .prepare('UPDATE custom_exercises SET name = ?, type = ?, category = ?, unit = ? WHERE id = ?')
    .bind(data.name, data.type, data.category, data.unit, id)
    .run();

  return getCustomExercise(db, id);
}

export async function deleteCustomExercise(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM custom_exercises WHERE id = ? AND user_id = ?')
    .bind(id, DEFAULT_USER_ID)
    .run();

  return result.meta.changes > 0;
}

// ==================== DATA MANAGEMENT ====================

export async function clearAllData(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM workouts WHERE user_id = ?').bind(DEFAULT_USER_ID).run();
  await db.prepare('DELETE FROM custom_exercises WHERE user_id = ?').bind(DEFAULT_USER_ID).run();
}
