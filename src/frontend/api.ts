// API client for workout tracker

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(response.status, error.error || 'Request failed');
  }

  return response.json();
}

// Workout types matching backend
export interface Set {
  weight: number;
  reps: number;
  note?: string;
}

export interface WorkoutExercise {
  name: string;
  sets: Set[];
}

export interface Workout {
  id: string;
  user_id: string;
  start_time: number;
  end_time?: number;
  exercises: WorkoutExercise[];
  created_at: number;
}

export interface CustomExercise {
  id: string;
  user_id: string;
  name: string;
  type: 'total' | '/side' | '+bar' | 'bodyweight';
  category: string;
  unit: 'lbs' | 'kg';
  created_at: number;
}

// Workout API
export async function getWorkouts(): Promise<Workout[]> {
  return apiFetch<Workout[]>('/workouts');
}

export async function getWorkout(id: string): Promise<Workout> {
  return apiFetch<Workout>(`/workouts/${id}`);
}

export async function createWorkout(data: {
  start_time: number;
  end_time?: number;
  exercises: WorkoutExercise[];
}): Promise<Workout> {
  return apiFetch<Workout>('/workouts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkout(id: string, data: {
  start_time: number;
  end_time?: number;
  exercises: WorkoutExercise[];
}): Promise<Workout> {
  return apiFetch<Workout>(`/workouts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkout(id: string): Promise<void> {
  await apiFetch(`/workouts/${id}`, { method: 'DELETE' });
}

// Custom Exercise API
export async function getCustomExercises(): Promise<CustomExercise[]> {
  return apiFetch<CustomExercise[]>('/exercises');
}

export async function createCustomExercise(data: {
  name: string;
  type: string;
  category: string;
  unit: string;
}): Promise<CustomExercise> {
  return apiFetch<CustomExercise>('/exercises', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomExercise(id: string, data: {
  name: string;
  type: string;
  category: string;
  unit: string;
}): Promise<CustomExercise> {
  return apiFetch<CustomExercise>(`/exercises/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await apiFetch(`/exercises/${id}`, { method: 'DELETE' });
}

// Data management
export async function clearAllData(): Promise<void> {
  await apiFetch('/data/clear', { method: 'POST' });
}
