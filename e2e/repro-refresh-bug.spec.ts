import { test, expect } from '@playwright/test';
import {
  authenticatePage,
  createWorkoutViaApi,
  setupTestUserWithExercises,
  TestSetup,
} from './helpers';

test.describe('refresh bug repro', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ request }) => {
    setup = await setupTestUserWithExercises(request);
  });

  test('refresh recovers spinner when network hangs', async ({ page, request, context }) => {
    test.setTimeout(30000);

    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 60000,
      end_time: Date.now() - 30000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });

    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('.ring-2.ring-white')).toBeVisible({ timeout: 5000 });

    // Now hang all subsequent /api/** requests
    await context.route('**/api/**', async () => {
      // Never resolve
    });

    const refreshBtn = page.locator('#tab-history .refresh-icon');
    await refreshBtn.click();

    // Spinner must clear within 20s even though network never responds.
    // Pre-fix: stayed spinning forever.
    await expect(refreshBtn).not.toHaveClass(/refreshing/, { timeout: 20000 });
  });
});
