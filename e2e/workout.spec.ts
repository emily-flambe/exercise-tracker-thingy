import { test, expect, Page } from '@playwright/test';
import {
  setupTestUserWithExercises,
  registerUserViaApi,
  createExerciseViaApi,
  createWorkoutViaApi,
  authenticatePage,
  TestSetup,
} from './helpers';

// Helper function to create a custom exercise via the UI (only needed for tests that test this flow)
async function createExerciseViaUI(page: Page, name: string, type: string, category: string, muscleGroup: string) {
  await page.getByRole('button', { name: 'Exercises' }).click();
  await page.getByRole('button', { name: '+ New' }).click();
  await page.fill('#exercise-name-input', name);
  await page.selectOption('#exercise-category-input', category);
  await page.selectOption('#exercise-muscle-group-input', muscleGroup);
  await page.locator(`input[name="weight-type"][value="${type}"]`).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#exercises-list-view')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Workout' }).click();
}

test.describe('Workout Tracker', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ page, request }) => {
    setup = await setupTestUserWithExercises(request);
    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('should display the start workout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();
  });

  test('should start a workout when clicking the button', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    // Skip category selection
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByText("Today's Workout")).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Exercise' })).toBeVisible();
  });

  test('should show add exercise screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await expect(page.getByRole('heading', { name: 'Add Exercise' })).toBeVisible();
    await expect(page.locator('#add-exercise-search')).toBeVisible();
  });

  test('should add an exercise to workout', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('+bar weight')).toBeVisible();
  });

  test('should navigate between tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();

    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    await page.getByRole('button', { name: 'Exercises' }).click();
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should filter exercises by category', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    await page.getByRole('button', { name: /^Chest/ }).click();
    await expect(page.locator('#add-Chest-exercises').getByText('Bench Press', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Back/ }).click();
    await expect(page.locator('#add-Back-exercises').getByText('Lat Pulldown')).toBeVisible();
  });

  test('should gray out exercises already in workout in category view', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    await page.getByRole('button', { name: /^Chest/ }).click();

    const benchPressButton = page.locator('#add-Chest-exercises button[data-exercise-in-workout="true"]').filter({ hasText: 'Bench Press' });
    await expect(benchPressButton).toBeVisible();
    await expect(benchPressButton).toHaveClass(/opacity-50/);
    await expect(benchPressButton).toBeDisabled();
    await expect(benchPressButton.getByText('In workout')).toBeVisible();
  });

  test('should gray out exercises already in workout in search results', async ({ page, request }) => {
    // Create Overhead Press via API for this specific test
    await createExerciseViaApi(request, setup.token, {
      name: 'Overhead Press', type: '+bar', category: 'Shoulders', muscle_group: 'Upper',
    });
    // Reload to pick up the new exercise
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();

    const benchPressButton = page.locator('#add-exercise-search-results button[data-exercise-in-workout="true"]').filter({ hasText: 'Bench Press' });
    await expect(benchPressButton).toBeVisible();
    await expect(benchPressButton).toHaveClass(/opacity-50/);
    await expect(benchPressButton).toBeDisabled();
    await expect(benchPressButton.getByText('In workout')).toBeVisible();

    const overheadPressButton = page.locator('#add-exercise-search-results button[data-exercise-in-workout="false"]').filter({ hasText: 'Overhead Press' });
    await expect(overheadPressButton).toBeVisible();
    await expect(overheadPressButton).not.toHaveClass(/opacity-50/);
    await expect(overheadPressButton).not.toBeDisabled();
  });

  test('should add a set to an exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('input[type="number"]').first()).toHaveValue('135');
  });

  test('should show pencil icon for notes', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('button[title="Add note"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="note"]').first()).not.toBeVisible();
  });

  test('should expand notes field when pencil icon is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.locator('button[title="Add note"]').first().click();

    await expect(page.locator('input[placeholder="note"]').first()).toBeVisible();
  });

  test('should save note and show edit button', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.locator('button[title="Add note"]').first().click();
    const noteField = page.locator('input[placeholder="note"]').first();
    await noteField.fill('felt strong today');
    await noteField.blur();

    await expect(page.locator('button[title="Edit note"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show PR star only when set is confirmed', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Unconfirmed set should have no PR star
    await expect(page.locator('span').filter({ hasText: '★' })).toHaveCount(0);

    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Confirmed set should show bright PR star
    await expect(page.locator('span.text-yellow-400').filter({ hasText: '★' }).and(page.locator(':not(.opacity-40)'))).toBeVisible();

    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Unconfirmed again - no PR star
    await expect(page.locator('span').filter({ hasText: '★' })).toHaveCount(0);
  });

  test('should show bright PR star only when set beats previous record and is confirmed', async ({ page, request }) => {
    // Create first workout via API with confirmed set
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 86400000,
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 8, completed: true }],
      }],
    });
    // Reload to pick up the new workout history
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    // Start second workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Unconfirmed set should have no PR star
    await expect(page.locator('span').filter({ hasText: '★' })).toHaveCount(0);

    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Confirmed set that beats previous record should show bright PR star
    await expect(page.locator('span.text-yellow-400').filter({ hasText: '★' }).and(page.locator(':not(.opacity-40)'))).toBeVisible();
  });
});

test.describe('Calendar View', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ page, request }) => {
    setup = await setupTestUserWithExercises(request);
    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('should show calendar view in history tab after completing workout', async ({ page, request }) => {
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expect(page.getByText('Tue', { exact: true })).toBeVisible();

    const todayCell = page.locator('.ring-2.ring-green-400');
    await expect(todayCell).toHaveClass(/bg-blue-600/);
  });

  test('should navigate between months in calendar', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    await page.locator('button').filter({ has: page.locator('path[d*="M9 5l7 7-7 7"]') }).click();

    const nextMonthDate = new Date();
    nextMonthDate.setDate(1);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const nextMonth = nextMonthDate.toLocaleString('default', { month: 'long' });
    const nextYear = nextMonthDate.getFullYear();
    await expect(page.getByText(`${nextMonth} ${nextYear}`)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    await page.locator('button').filter({ has: page.locator('path[d*="M15 19l-7-7 7-7"]') }).click();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();
  });

  test('should navigate to today when clicking Today button', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();

    await page.locator('button').filter({ has: page.locator('path[d*="M9 5l7 7-7 7"]') }).click();

    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    await page.getByRole('button', { name: 'Today' }).click();

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Today' })).not.toBeVisible();
  });

  test('should open workout when clicking on day with workout', async ({ page, request }) => {
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    await page.locator('.ring-2.ring-green-400').click();

    await expect(page.locator('#tab-workout.tab-content.active')).toBeVisible();
    await expect(page.locator('#workout-active').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
  });

  test('should not show "Copy to new workout" button', async ({ page, request }) => {
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.getByText('Sun', { exact: true })).toBeVisible();

    const copyButton = page.getByText('Copy to new workout');
    await expect(copyButton).toHaveCount(0);
  });

  test('should show multiple workouts for same day', async ({ page, request }) => {
    // Create first workout via API
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 60000,
      end_time: Date.now() - 30000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    // Create second workout via API
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Squat',
        sets: [{ weight: 185, reps: 8, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    await page.locator('.ring-2.ring-green-400').click();

    await expect(page.getByText('Back to calendar')).toBeVisible();
    await expect(page.locator('#history-list').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('#history-list').getByText('Squat')).toBeVisible();
  });

  test('should show filter pills below calendar and highlight matching dates yellow', async ({ page, request }) => {
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Upper' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lower' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Core' })).toBeVisible();

    const todayCell = page.locator('.ring-2.ring-green-400');
    await expect(todayCell).toHaveClass(/bg-blue-600/);

    await page.getByRole('button', { name: 'Upper' }).click();

    await expect(page.getByRole('button', { name: 'Upper' })).toHaveClass(/bg-yellow-500/);

    await expect(todayCell).toHaveClass(/bg-yellow-500/);

    await page.getByRole('button', { name: 'Upper' }).click();
    await page.getByRole('button', { name: 'Lower' }).click();

    await expect(todayCell).toHaveClass(/bg-blue-600/);

    await page.getByRole('button', { name: 'Lower' }).click();

    await expect(todayCell).toHaveClass(/bg-blue-600/);
  });

  test('should return to calendar from day view', async ({ page, request }) => {
    // Create first workout via API
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 60000,
      end_time: Date.now() - 30000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 10, completed: true }],
      }],
    });
    // Create second workout for same day to trigger day view
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [{
        name: 'Squat',
        sets: [{ weight: 185, reps: 8, completed: true }],
      }],
    });
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'History', exact: true }).click();

    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    await page.locator('.ring-2.ring-green-400').click();

    await expect(page.getByText('Back to calendar')).toBeVisible();

    await page.getByText('Back to calendar').click();

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();
  });
});

test.describe('Exercise Rename During Active Workout', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ page, request }) => {
    setup = await setupTestUserWithExercises(request);
    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('should update current workout when exercise is renamed', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    await page.getByRole('button', { name: 'Exercises' }).click();
    await page.fill('#exercise-search', 'Bench Press');
    await page.locator('#exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.fill('#exercise-name-input', 'Barbell Bench Press');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#exercises-list-view')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Workout' }).click();

    await expect(page.locator('#exercise-list').getByText('Barbell Bench Press')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('Bench Press', { exact: true })).not.toBeVisible();
  });

  test('should calculate PRs correctly after renaming exercise during active workout', async ({ page, request }) => {
    // Create first completed workout via API with "Bench Press" to establish history
    await createWorkoutViaApi(request, setup.token, {
      start_time: Date.now() - 86400000,
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [{
        name: 'Bench Press',
        sets: [{ weight: 135, reps: 8, completed: true }],
      }],
    });
    // Reload to pick up the new workout history
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    // Start second workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();

    const prStars = page.locator('#exercise-list span').filter({ hasText: '★' });
    await expect(prStars).toHaveCount(0);

    // Now rename the exercise while the workout is active
    await page.getByRole('button', { name: 'Exercises' }).click();
    await page.fill('#exercise-search', 'Bench Press');
    await page.locator('#exercise-search-results').getByText('Bench Press', { exact: true }).click();
    await page.fill('#exercise-name-input', 'Barbell Bench Press');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#exercises-list-view')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Workout' }).click();

    await expect(page.locator('#exercise-list').getByText('Barbell Bench Press')).toBeVisible();

    const prStarsAfterRename = page.locator('#exercise-list span').filter({ hasText: '★' });
    await expect(prStarsAfterRename).toHaveCount(0);

    // Now add a set that DOES beat the record (10 reps vs previous 8)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Unconfirmed set should have no PR star (only confirmed sets can be PRs)
    await expect(page.locator('#exercise-list span').filter({ hasText: '★' })).toHaveCount(0);
  });
});

test.describe('Authentication', () => {
  test('should show login screen by default', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('#auth-login-tab')).toBeVisible();
    await expect(page.locator('#auth-register-tab')).toBeVisible();
  });

  test('should register new user and login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const uniqueUser = `user_${Date.now()}`;
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', uniqueUser);
    await page.fill('#auth-password', 'password123');
    await page.click('#auth-submit-btn');

    await expect(page.locator('#main-app')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();
  });

  test('should show error for invalid login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.fill('#auth-username', 'nonexistent');
    await page.fill('#auth-password', 'wrongpass');
    await page.click('#auth-submit-btn');

    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText('Invalid');
  });

  test('should not flash login screen when authenticated on reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const uniqueUser = `loading_${Date.now()}`;
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', uniqueUser);
    await page.fill('#auth-password', 'password123');
    await page.click('#auth-submit-btn');
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    await page.reload();
    await page.evaluate(() => {
      const el = document.getElementById('auth-screen');
      if (el && !el.classList.contains('hidden')) {
        (window as any).__authScreenFlashed = true;
      }
      const observer = new MutationObserver(() => {
        if (el && !el.classList.contains('hidden')) {
          (window as any).__authScreenFlashed = true;
        }
      });
      if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#loading-screen')).toBeHidden();
    await expect(page.locator('#auth-screen')).toBeHidden();

    const flashed = await page.evaluate(() => (window as any).__authScreenFlashed);
    expect(flashed).toBeFalsy();
  });

  test('should logout and show login screen', async ({ page }) => {
    await page.goto('/');

    const authScreen = page.locator('#auth-screen');
    if (await authScreen.isVisible()) {
      const uniqueUser = `logout_${Date.now()}`;
      await page.click('#auth-register-tab');
      await page.fill('#auth-username', uniqueUser);
      await page.fill('#auth-password', 'password123');
      await page.click('#auth-submit-btn');
      await expect(page.locator('#main-app')).toBeVisible({ timeout: 5000 });
    }

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page.locator('#auth-screen')).toBeVisible();
  });
});
