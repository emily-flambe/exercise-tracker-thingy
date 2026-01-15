// API client for workout tracker

// Use relative path for web, absolute URL for Capacitor (Android/iOS)
// Capacitor serves from https://localhost, so check for that
const isCapacitor = (window as any).Capacitor !== undefined;
const API_BASE = isCapacitor ? 'https://workout.emilycogsdill.com/api' : '/api';
const TOKEN_KEY = 'workout_auth_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
    throw new ApiError(response.status, errorData.error || 'Request failed');
  }

  return response.json();
}

// User types
export interface User {
  id: string;
  username: string;
  created_at: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Auth API
export async function register(username: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(response.token);
  return response;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(response.token);
  return response;
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function logout(): void {
  clearToken();
}

// Workout types matching backend
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

// PR API
export async function getAllPRs(): Promise<PersonalRecord[]> {
  return apiFetch<PersonalRecord[]>('/workouts/prs/all');
}

export async function getPRsForExercise(exerciseName: string): Promise<PersonalRecord[]> {
  return apiFetch<PersonalRecord[]>(`/workouts/prs/${encodeURIComponent(exerciseName)}`);
}

// Data management
export async function clearAllData(): Promise<void> {
  await apiFetch('/data/clear', { method: 'POST' });
}
