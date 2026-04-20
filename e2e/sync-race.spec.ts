import { test, expect } from '@playwright/test';
import {
  setupTestUserWithExercises,
  createWorkoutViaApi,
  authenticatePage,
  TestSetup,
} from './helpers';

// Regression test for issue #102: concurrent writes from another client
// (or MCP/API) can resurrect a deleted exercise or clobber freshly-toggled
// completed sets when the browser autosaves after a background sync poll.
//
// The fix introduces a 3-way merge using a captured `baseServerWorkout`
// baseline. These e2e checks assert the merged state after the two
// "write paths" collide:
//   (1) a direct API PUT simulating another client modifying the workout
//   (2) the browser's autosave writing local edits back
test.describe('Sync Race Regression (issue #102)', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ page, request }) => {
    setup = await setupTestUserWithExercises(request);
    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('ghost exercise does not reappear after concurrent API write + local autosave', async ({ page, request }) => {
    // 1. Seed a workout via API with two exercises, one completed set on Bench.
    const startTime = Date.now() - 60_000;
    const endTime = Date.now();
    const created = await createWorkoutViaApi(request, setup.token, {
      start_time: startTime,
      end_time: endTime,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }],
        },
        {
          name: 'Squat',
          sets: [{ weight: 185, reps: 5, completed: true }],
        },
      ],
    });
    const workoutId: string = created.id;
    expect(workoutId).toBeTruthy();

    // 2. Reload so the frontend picks up history, then open the workout for editing.
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('.ring-2.ring-white')).toBeVisible({ timeout: 5000 });
    await page.locator('.ring-2.ring-white').click();
    await expect(page.locator('#tab-workout.tab-content.active')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('Squat')).toBeVisible();

    // 3. Delete Squat locally (user-initiated) so Bench is the only local exercise.
    // This matches the resurrection scenario: locally-deleted exercise, still on server.
    await page.evaluate(() => (window as any).app.removeExercise(1));
    await expect(page.locator('#exercise-list').getByText('Squat')).toHaveCount(0);

    // 4. Before the local autosave fires (1.5s debounce), another client PUTs
    //    an update to the workout — adding a remote-only Lat Pulldown entry and
    //    bumping updated_at. This is the server-side concurrent write.
    const fresh = await request.get(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
    });
    const remoteCopy = await fresh.json();
    const concurrentPut = await request.put(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
      data: {
        start_time: remoteCopy.start_time,
        end_time: remoteCopy.end_time,
        target_categories: remoteCopy.target_categories ?? null,
        updated_at: remoteCopy.updated_at,
        exercises: [
          { name: 'Bench Press', sets: [{ weight: 135, reps: 10, completed: true }] },
          { name: 'Squat',       sets: [{ weight: 185, reps: 5, completed: true }] },
          { name: 'Lat Pulldown', sets: [{ weight: 100, reps: 12, completed: true }] },
        ],
      },
    });
    expect(concurrentPut.status()).toBe(200);

    // 5. Make a local edit to trigger autosave (add a new set to Bench).
    // The autosave will 409 because updated_at is stale, enter the
    // mergeServerWorkout path with localAuthoritative=true, and must:
    //  - NOT resurrect the locally-deleted Squat
    //  - Keep the remotely-added Lat Pulldown (server addition not in base)
    //  - Preserve the existing completed Bench set
    await page.evaluate(() => (window as any).app.addSet(0));
    // Event-driven wait: poll the server until the merged shape settles —
    // Squat removed (local deletion honored), Lat Pulldown present (remote
    // addition preserved). This covers the 1.5s autosave debounce plus the
    // 409-conflict retry path without a fixed sleep.
    await expect
      .poll(
        async () => {
          const r = await request.get(`/api/workouts/${workoutId}`, {
            headers: { Authorization: `Bearer ${setup.token}` },
          });
          const w = await r.json();
          const names = (w.exercises as Array<{ name: string }>).map((e) => e.name);
          return {
            hasSquat: names.includes('Squat'),
            hasLatPulldown: names.includes('Lat Pulldown'),
          };
        },
        { timeout: 10_000, intervals: [250, 500, 1000] },
      )
      .toEqual({ hasSquat: false, hasLatPulldown: true });

    // 6. Re-render shouldn't have brought Squat back (RESURRECTION regression).
    await expect(page.locator('#exercise-list').getByText('Squat')).toHaveCount(0);

    // 7. Lat Pulldown (remote addition, not in our base) should be present.
    await expect(page.locator('#exercise-list').getByText('Lat Pulldown')).toBeVisible();

    // 8. Bench Press should still be there with its original completed set.
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    // 9. Verify server state matches the merged result (source of truth).
    const afterResp = await request.get(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
    });
    const afterState = await afterResp.json();
    const names = afterState.exercises.map((e: { name: string }) => e.name).sort();
    expect(names).not.toContain('Squat');
    expect(names).toContain('Bench Press');
    expect(names).toContain('Lat Pulldown');

    // 10. The pre-existing completed Bench set must survive the merge.
    const bench = afterState.exercises.find((e: { name: string }) => e.name === 'Bench Press');
    expect(bench).toBeDefined();
    const firstBenchSet = bench.sets.find(
      (s: { weight: number; reps: number; completed?: boolean }) =>
        s.weight === 135 && s.reps === 10,
    );
    expect(firstBenchSet).toBeDefined();
    expect(firstBenchSet.completed).toBe(true);
  });

  test('local completed-set toggle survives a concurrent server change on a different exercise', async ({ page, request }) => {
    // This covers the vanishing-sets regression: user toggles a set complete
    // at roughly the same time as another client writes to the same workout
    // (different exercise). The local toggle must not be lost.
    const startTime = Date.now() - 60_000;
    const endTime = Date.now();
    const created = await createWorkoutViaApi(request, setup.token, {
      start_time: startTime,
      end_time: endTime,
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 135, reps: 10, completed: false }] },
        { name: 'Squat',       sets: [{ weight: 185, reps: 5, completed: false }] },
      ],
    });
    const workoutId: string = created.id;

    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('.ring-2.ring-white')).toBeVisible({ timeout: 5000 });
    await page.locator('.ring-2.ring-white').click();
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    // Toggle Bench set to completed locally.
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Concurrent server-side change: mark Squat's set completed via API.
    const fresh = await request.get(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
    });
    const remoteCopy = await fresh.json();
    const concurrentPut = await request.put(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
      data: {
        start_time: remoteCopy.start_time,
        end_time: remoteCopy.end_time,
        target_categories: remoteCopy.target_categories ?? null,
        updated_at: remoteCopy.updated_at,
        exercises: [
          { name: 'Bench Press', sets: [{ weight: 135, reps: 10, completed: false }] },
          { name: 'Squat',       sets: [{ weight: 185, reps: 5, completed: true }] },
        ],
      },
    });
    expect(concurrentPut.status()).toBe(200);

    // Poll the server until the merged shape settles: Bench's local toggle
    // should land AND Squat's remote toggle should be preserved. This covers
    // the 1.5s autosave debounce and 409-retry path without a fixed sleep.
    await expect
      .poll(
        async () => {
          const r = await request.get(`/api/workouts/${workoutId}`, {
            headers: { Authorization: `Bearer ${setup.token}` },
          });
          const w = await r.json();
          const bench = w.exercises.find((e: { name: string }) => e.name === 'Bench Press');
          const squat = w.exercises.find((e: { name: string }) => e.name === 'Squat');
          return {
            benchCompleted: bench?.sets[0]?.completed === true,
            squatCompleted: squat?.sets[0]?.completed === true,
          };
        },
        { timeout: 10_000, intervals: [250, 500, 1000] },
      )
      .toEqual({ benchCompleted: true, squatCompleted: true });

    // Final assertion on the server for a clear failure message.
    const afterResp = await request.get(`/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${setup.token}` },
    });
    const afterState = await afterResp.json();
    const bench = afterState.exercises.find((e: { name: string }) => e.name === 'Bench Press');
    const squat = afterState.exercises.find((e: { name: string }) => e.name === 'Squat');
    expect(bench.sets[0].completed).toBe(true); // local toggle survived
    expect(squat.sets[0].completed).toBe(true); // remote change preserved
  });
});
