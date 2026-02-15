import { APIRequestContext, Page } from '@playwright/test';

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
 * Inject the auth token into localStorage and navigate so the app picks it up.
 */
export async function authenticatePage(page: Page, token: string) {
  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('workout_auth_token', t), token);
  await page.reload();
}
