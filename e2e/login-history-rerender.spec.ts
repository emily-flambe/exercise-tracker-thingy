import { test, expect } from '@playwright/test';
import {
  createWorkoutViaApi,
  registerUserViaApi,
  setupTestUserWithExercises,
  TestSetup,
} from './helpers';

// Regression test for the bug where logging in and clicking History BEFORE
// the background loadData() resolved left the calendar permanently empty:
// renderHistory ran against state.history === [], and nothing re-rendered
// the tab when data eventually arrived.
//
// Reproduces a v1.1.31/v1.1.32 regression introduced when the auth submit
// handler was changed from `await loadData(); onLoginSuccess()` to
// `onLoginSuccess(); void loadData()` — the screen-transition fix removed
// the only mechanism that guaranteed state was populated before the first
// data-driven render.

test.describe('login → history re-renders when data arrives', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ request }) => {
    setup = await setupTestUserWithExercises(request);

    // Seed a workout dated today so the default-current-month calendar view
    // is the one that should light up.
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 60_000,
      end_time: Date.now() - 30_000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
  });

  test('calendar fills in after login even if user clicks History before loadData finishes', async ({ page, context }) => {
    test.setTimeout(30000);

    // Delay GET /api/workouts so we deterministically lose the race: the user
    // will see the history tab BEFORE the workouts response lands.
    await context.route('**/api/workouts', async route => {
      if (route.request().method() !== 'GET') {
        return route.continue();
      }
      await new Promise(r => setTimeout(r, 1500));
      return route.continue();
    });

    await page.goto('/');
    await page.fill('#auth-username', setup.username);
    await page.fill('#auth-password', 'testpass123');
    await page.click('#auth-submit-btn');

    // Wait for the main app to appear, then immediately jump to History —
    // mirroring the real-world bug. Don't await loadData.
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
    await page.locator('#nav-history').click();

    // At this point state.history is still empty (the delayed GET hasn't
    // resolved). The calendar renders with zero red day-cells.
    const redCells = page.locator('#tab-history div.bg-\\[\\#FF0000\\]');

    // The fix: once loadData() resolves, the active tab is re-rendered, and
    // the red cell appears. Pre-fix this would stay 0 forever.
    await expect(redCells).toHaveCount(1, { timeout: 10000 });
  });

  test('cache-hydrate startup also re-renders history when fresh data arrives', async ({ page, context }) => {
    test.setTimeout(30000);

    // First visit: log in normally so the offline cache gets populated.
    await page.goto('/');
    await page.fill('#auth-username', setup.username);
    await page.fill('#auth-password', 'testpass123');
    await page.click('#auth-submit-btn');
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
    await page.locator('#nav-history').click();
    await expect(page.locator('#tab-history div.bg-\\[\\#FF0000\\]')).toHaveCount(1, { timeout: 10000 });

    // Add a SECOND workout via the API while the user is "away". A reload
    // hydrates from cache (1 workout), then background loadData fetches
    // the latest (2 workouts) — and the calendar must reflect the new
    // workout without requiring a manual refresh.
    await createWorkoutViaApi(page.request, setup.token, {
      start_time: Date.now() - 120_000,
      end_time: Date.now() - 90_000,
      exercises: [{
        name: 'Squat',
        sets: [{ weight: 225, reps: 5, completed: true }],
      }],
    });

    // Delay the background workouts fetch so the cache-hydrated render
    // (1 workout) is observable before the fresh fetch (2 workouts) lands.
    await context.route('**/api/workouts', async route => {
      if (route.request().method() !== 'GET') {
        return route.continue();
      }
      await new Promise(r => setTimeout(r, 1500));
      return route.continue();
    });

    await page.reload();
    await page.locator('#nav-history').click();

    // Either both workouts fell on the same day (1 cell) or two different
    // days (2 cells). Both happened in the last few minutes so they should
    // be the same day in any plausible timezone — assert at least 1, then
    // assert the fresh data has landed by re-counting after the delay.
    await expect(page.locator('#tab-history div.bg-\\[\\#FF0000\\]')).toHaveCount(1, { timeout: 5000 });

    // After loadData resolves, the day cell's tooltip/onclick still works
    // and clicking it surfaces BOTH workouts (proving state.history was
    // refreshed from the server, not just the stale cache).
    await page.waitForTimeout(2500);
    await page.locator('#tab-history div[onclick*="showDayWorkouts"]').first().click();
    // showDayWorkouts renders one card per workout. Two workouts on the same
    // day = two cards; if loadData hadn't re-rendered, we'd still be looking
    // at the cached snapshot with only one.
    await expect(page.locator('#history-list div[onclick*="editWorkout"]')).toHaveCount(2, { timeout: 5000 });
  });
});

// Unit-style guard: make sure auth.ts no longer imports or calls loadData.
// If it does, someone has reintroduced the bug pattern of firing background
// loadData from inside the auth module (which can't re-render the active tab
// without creating an import cycle into the render modules).
//
// We strip comments before matching so the comments in auth.ts that explain
// why the import was removed don't trip the guard.
test('auth.ts does not import loadData (architectural guard)', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const authSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/frontend/auth.ts'),
    'utf-8',
  );
  const codeOnly = authSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  expect(codeOnly).not.toMatch(/from\s+['"]\.\/data['"]/);
  expect(codeOnly).not.toMatch(/\bloadData\s*\(/);
  expect(codeOnly).not.toMatch(/import\s*\{[^}]*\bloadData\b/);
});
