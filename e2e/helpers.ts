import { APIRequestContext, Page, expect } from '@playwright/test';

const TEST_PASSWORD = 'testpass123';

export interface TestSetup {
  token: string;
  username: string;
}

/**
 * Register a new user via the API (bypasses UI).
 */
export async function registerUserViaApi(request: APIRequestContext): Promise<TestSetup> {
  const username = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await request.post('/api/auth/register', {
    data: { username, password: TEST_PASSWORD },
  });
  const body = await res.json();
  return { token: body.token, username };
}

/**
 * Create a custom exercise via the API.
 */
export async function createExerciseViaApi(
  request: APIRequestContext,
  token: string,
  exercise: { name: string; type: string; category: string; muscle_group: string; unit?: string },
) {
  await request.post('/api/exercises', {
    headers: { Authorization: `Bearer ${token}` },
    data: { ...exercise, unit: exercise.unit ?? 'lbs' },
  });
}

/**
 * Register a user and create the standard 3 test exercises via API.
 */
export async function setupTestUserWithExercises(request: APIRequestContext): Promise<TestSetup> {
  const setup = await registerUserViaApi(request);

  await createExerciseViaApi(request, setup.token, {
    name: 'Bench Press', type: '+bar', category: 'Chest', muscle_group: 'Upper',
  });
  await createExerciseViaApi(request, setup.token, {
    name: 'Squat', type: '+bar', category: 'Legs', muscle_group: 'Lower',
  });
  await createExerciseViaApi(request, setup.token, {
    name: 'Lat Pulldown', type: 'total', category: 'Back', muscle_group: 'Upper',
  });

  return setup;
}

/**
 * Create a workout via the API (bypasses UI).
 */
export async function createWorkoutViaApi(
  request: APIRequestContext,
  token: string,
  workout: {
    start_time: number;
    end_time?: number;
    exercises: Array<{
      name: string;
      sets: Array<{ weight: number; reps: number; completed?: boolean; missed?: boolean }>;
    }>;
  },
) {
  const res = await request.post('/api/workouts', {
    headers: { Authorization: `Bearer ${token}` },
    data: workout,
  });
  return res.json();
}

/**
 * Inject the auth token into localStorage and navigate so the app picks it up.
 */
export async function authenticatePage(page: Page, token: string) {
  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('workout_auth_token', t), token);
  await page.reload();
}

/**
 * Start a workout and add one exercise by name (searches and selects it).
 */
export async function startWorkoutWithExercise(page: Page, exerciseName: string) {
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.fill('#add-exercise-search', exerciseName);
  await expect(page.locator('#add-exercise-search-results')).toBeVisible();
  await page.locator('#add-exercise-search-results').getByText(exerciseName, { exact: true }).click();
}

/**
 * Add a set with the given weight and reps (clicks "+ Add set", fills, saves).
 */
export async function addSet(page: Page, weight: string, reps: string) {
  await page.getByRole('button', { name: '+ Add set' }).click();
  await page.fill('input[placeholder="wt"]', weight);
  await page.fill('input[placeholder="reps"]', reps);
  await page.getByRole('button', { name: 'Save' }).click();
}

/**
 * Add another exercise to an already-started workout (searches and selects it).
 */
export async function addExerciseToWorkout(page: Page, exerciseName: string) {
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.fill('#add-exercise-search', exerciseName);
  await expect(page.locator('#add-exercise-search-results')).toBeVisible();
  await page.locator('#add-exercise-search-results').getByText(exerciseName, { exact: true }).click();
}
