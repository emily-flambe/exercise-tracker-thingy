// Exercise types
export type WeightType = 'total' | '/side' | '+bar' | 'bodyweight';
export type Unit = 'lbs' | 'kg';
export type Category =
  | 'Chest'
  | 'Shoulders'
  | 'Triceps'
  | 'Back'
  | 'Biceps'
  | 'Legs'
  | 'Core'
  | 'Cardio'
  | 'Other';
export type MuscleGroup = 'Upper' | 'Lower' | 'Core' | 'Cardio' | 'Other';

export interface Exercise {
  name: string;
  type: WeightType;
  category: Category;
  muscle_group: MuscleGroup;
  unit: Unit;
}

export interface CustomExercise extends Exercise {
  id: string;
  user_id: string;
  created_at: number;
}

// Set and Workout types
export interface Set {
  weight: number;
  reps: number;
  note?: string;
  isPR?: boolean;
  completed?: boolean;
  missed?: boolean;
}

export interface WorkoutExercise {
  name: string;
  sets: Set[];
  completed?: boolean;
  notes?: string;
}

export interface Workout {
  id: string;
  user_id: string;
  start_time: number;
  end_time?: number;
  target_categories?: MuscleGroup[];
  exercises: WorkoutExercise[];
  created_at: number;
}

// Database row types
export interface WorkoutRow {
  id: string;
  user_id: string;
  start_time: number;
  end_time: number | null;
  target_categories: string | null;
  created_at: number;
}

export interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_name: string;
  position: number;
  completed: number;
  notes: string | null;
}

export interface SetRow {
  id: string;
  workout_exercise_id: string;
  weight: number;
  reps: number;
  note: string | null;
  position: number;
  completed: number;
  missed: number;
}

export interface CustomExerciseRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  category: string;
  muscle_group: string;
  unit: string;
  created_at: number;
}

export interface PersonalRecord {
  id: string;
  user_id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  workout_id: string;
  set_index: number;
  achieved_at: number;
}

export interface PersonalRecordRow {
  id: string;
  user_id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  workout_id: string;
  set_index: number;
  achieved_at: number;
}

// API types
export interface CreateWorkoutRequest {
  start_time: number;
  end_time?: number;
  target_categories?: MuscleGroup[];
  exercises: WorkoutExercise[];
}

export interface UpdateWorkoutRequest {
  start_time?: number;
  end_time?: number;
  target_categories?: MuscleGroup[];
  exercises?: WorkoutExercise[];
}

export interface CreateExerciseRequest {
  name: string;
  type: WeightType;
  category: Category;
  muscle_group: MuscleGroup;
  unit: Unit;
}

export interface UpdateExerciseRequest {
  name?: string;
  type?: WeightType;
  category?: Category;
  muscle_group?: MuscleGroup;
  unit?: Unit;
}

// User types
export interface User {
  id: string;
  username: string;
  created_at: number;
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: number;
}

// Auth request/response types
export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Cloudflare bindings
export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}
