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
    // The spinner clears when the read fetch aborts, which is bounded by
    // DEFAULT_FETCH_TIMEOUT_MS (30s) — raised from 10s to stop the large
    // /workouts payload from aborting on real connections and silently
    // dropping data. The original bug this guards against was "spins forever";
    // bounded-at-30s still proves recovery. Budget must exceed the expect below.
    test.setTimeout(50000);

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

    // Spinner must clear once the read aborts (~30s) even though the network
    // never responds. Pre-fix: stayed spinning forever. 36s = the 30s fetch
    // timeout plus generous margin for the abort to propagate through
    // handleRefresh on a slow CI runner.
    await expect(refreshBtn).not.toHaveClass(/refreshing/, { timeout: 36000 });
  });
});
