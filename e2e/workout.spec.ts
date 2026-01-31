import { test, expect } from '@playwright/test';

const testPassword = 'testpass123';

test.describe('Workout Tracker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Clear any existing tokens and reload
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Generate unique username for each test
    const testUsername = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Register a new user
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', testUsername);
    await page.fill('#auth-password', testPassword);
    await page.click('#auth-submit-btn');

    // Wait for main app to be visible
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
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
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
    // Check workout tab is active
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();

    // Go to history
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Go to exercises
    await page.getByRole('button', { name: 'Exercises' }).click();
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();

    // Go to settings
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should filter exercises by category', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    // Expand Chest category
    await page.getByRole('button', { name: /^Chest/ }).click();
    await expect(page.locator('#add-Chest-exercises').getByText('Bench Press', { exact: true })).toBeVisible();

    // Expand Back category
    await page.getByRole('button', { name: /^Back/ }).click();
    await expect(page.locator('#add-Back-exercises').getByText('Lat Pulldown')).toBeVisible();
  });

  test('should gray out exercises already in workout in category view', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    // Add Bench Press via search
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Verify Bench Press is in workout
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    // Go back to add exercise screen
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    // Expand Chest category
    await page.getByRole('button', { name: /^Chest/ }).click();

    // Verify Bench Press is grayed out with "In workout" badge
    const benchPressButton = page.locator('#add-Chest-exercises button[data-exercise-in-workout="true"]').filter({ hasText: 'Bench Press' });
    await expect(benchPressButton).toBeVisible();
    await expect(benchPressButton).toHaveClass(/opacity-50/);
    await expect(benchPressButton).toBeDisabled();
    await expect(benchPressButton.getByText('In workout')).toBeVisible();
  });

  test('should gray out exercises already in workout in search results', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    // Add Bench Press via search
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Verify Bench Press is in workout
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    // Go back to add exercise screen and search for "Press"
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();

    // Verify Bench Press is grayed out in search results
    const benchPressButton = page.locator('#add-exercise-search-results button[data-exercise-in-workout="true"]').filter({ hasText: 'Bench Press' });
    await expect(benchPressButton).toBeVisible();
    await expect(benchPressButton).toHaveClass(/opacity-50/);
    await expect(benchPressButton).toBeDisabled();
    await expect(benchPressButton.getByText('In workout')).toBeVisible();

    // Verify Overhead Press is NOT grayed out (contains "Press" but not in workout)
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

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify set was added
    await expect(page.locator('input[type="number"]').first()).toHaveValue('135');
  });

  test('should show pencil icon for notes', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Should see the pencil icon
    await expect(page.locator('button[title="Add note"]').first()).toBeVisible();

    // Should NOT see the notes input field initially
    await expect(page.locator('input[placeholder="note"]').first()).not.toBeVisible();
  });

  test('should expand notes field when pencil icon is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Click pencil icon to expand notes
    await page.locator('button[title="Add note"]').first().click();

    // Should now see the notes input field
    await expect(page.locator('input[placeholder="note"]').first()).toBeVisible();
  });

  test('should save note and show edit button', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Add a note
    await page.locator('button[title="Add note"]').first().click();
    const noteField = page.locator('input[placeholder="note"]').first();
    await noteField.fill('felt strong today');
    await noteField.blur();

    // Wait for the button title to change from "Add note" to "Edit note"
    await expect(page.locator('button[title="Edit note"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show dim PR star for unconfirmed sets and bright star when confirmed', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add first set - should be a PR since it's the first at this weight
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for the set to be added and verify star exists and is dim
    await expect(page.locator('span.opacity-40').filter({ hasText: '★' })).toBeVisible();

    // Toggle the set completed state (exercise 0, set 0)
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Wait for bright star to appear (confirmed PR)
    await expect(page.locator('span.text-yellow-400').filter({ hasText: '★' }).and(page.locator(':not(.opacity-40)'))).toBeVisible();

    // Toggle set completed state again to unconfirm
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Wait for dim star to reappear (unconfirmed PR)
    await expect(page.locator('span.opacity-40').filter({ hasText: '★' })).toBeVisible();
  });

  test('should show bright PR star only when set beats previous record and is confirmed', async ({ page }) => {
    // Start first workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set with 8 reps (will be dim PR)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify dim star appears
    await expect(page.locator('span.opacity-40').filter({ hasText: '★' })).toBeVisible();

    // Confirm the first set (exercise 0, set 0)
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Finish workout
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for workout to be saved and navigate back to empty screen
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Start second workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set with 10 reps (beats previous 8, should be dim PR initially)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify star is dim initially
    await expect(page.locator('span.opacity-40').filter({ hasText: '★' })).toBeVisible();

    // Confirm the second workout's set (exercise 0, set 0)
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Wait for bright star to appear (confirmed PR beats previous record)
    await expect(page.locator('span.text-yellow-400').filter({ hasText: '★' }).and(page.locator(':not(.opacity-40)'))).toBeVisible();
  });
});

test.describe('Calendar View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Clear any existing tokens and reload
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Generate unique username for each test
    const testUsername = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Register a new user
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', testUsername);
    await page.fill('#auth-password', testPassword);
    await page.click('#auth-submit-btn');

    // Wait for main app to be visible
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('should show calendar view in history tab after completing workout', async ({ page }) => {
    // Create a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Finish workout
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for workout to be saved (Start Workout button reappears)
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Wait for calendar to render with today's workout
    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    // Should see calendar elements
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    // Should see day headers
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expect(page.getByText('Tue', { exact: true })).toBeVisible();

    // Should see today highlighted with workout (blue background indicates workout exists)
    const todayCell = page.locator('.ring-2.ring-green-400');
    await expect(todayCell).toHaveClass(/bg-blue-600/);
  });

  test('should navigate between months in calendar', async ({ page }) => {
    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    // Click next month button
    await page.locator('button').filter({ has: page.locator('path[d*="M9 5l7 7-7 7"]') }).click();

    // Should show next month (use day 1 to avoid month overflow issues like Jan 31 -> March)
    const nextMonthDate = new Date();
    nextMonthDate.setDate(1);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const nextMonth = nextMonthDate.toLocaleString('default', { month: 'long' });
    const nextYear = nextMonthDate.getFullYear();
    await expect(page.getByText(`${nextMonth} ${nextYear}`)).toBeVisible();

    // Should show "Today" button when not on current month
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    // Click previous month twice to go back
    await page.locator('button').filter({ has: page.locator('path[d*="M15 19l-7-7 7-7"]') }).click();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();
  });

  test('should navigate to today when clicking Today button', async ({ page }) => {
    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Go to next month
    await page.locator('button').filter({ has: page.locator('path[d*="M9 5l7 7-7 7"]') }).click();

    // Should see Today button
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    // Click Today button
    await page.getByRole('button', { name: 'Today' }).click();

    // Should be back to current month
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();

    // Today button should not be visible on current month
    await expect(page.getByRole('button', { name: 'Today' })).not.toBeVisible();
  });

  test('should open workout when clicking on day with workout', async ({ page }) => {
    // Create a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Finish workout
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for workout to be saved (Start Workout button reappears)
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Wait for calendar to render with today's workout
    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    // Click on today's workout cell
    await page.locator('.ring-2.ring-green-400').click();

    // Should navigate to workout tab showing the workout
    await expect(page.locator('#tab-workout.tab-content.active')).toBeVisible();
    await expect(page.locator('#workout-active').getByText('Bench Press')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('should not show "Copy to new workout" button', async ({ page }) => {
    // Create a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Finish workout
    await page.getByRole('button', { name: 'Finish' }).click();

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Verify calendar is showing
    await expect(page.getByText('Sun', { exact: true })).toBeVisible();

    // Should not see "Copy to new workout" button anywhere on page
    const copyButton = page.getByText('Copy to new workout');
    await expect(copyButton).toHaveCount(0);
  });

  test('should show multiple workouts for same day', async ({ page }) => {
    // Create first workout
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
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for save
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Create second workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Squat');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Squat', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '185');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for second workout to be saved
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Wait for calendar to render
    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    // Click on today's cell (has green ring and blue background for workout)
    await page.locator('.ring-2.ring-green-400').click();

    // Should show day view with both workouts
    await expect(page.getByText('Back to calendar')).toBeVisible();
    await expect(page.locator('#history-list').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('#history-list').getByText('Squat')).toBeVisible();
  });

  test('should show filter pills below calendar and highlight matching dates yellow', async ({ page }) => {
    // Create a workout with a Chest exercise (Bench Press)
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Finish workout
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Wait for calendar to render with today's workout
    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    // Verify filter pills are displayed below the calendar
    await expect(page.getByRole('button', { name: 'Chest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Legs' })).toBeVisible();

    // Verify today's workout cell has blue background initially (no filter active)
    const todayCell = page.locator('.ring-2.ring-green-400');
    await expect(todayCell).toHaveClass(/bg-blue-600/);

    // Click on Chest filter (Bench Press is a Chest exercise)
    await page.getByRole('button', { name: 'Chest' }).click();

    // Verify the Chest filter pill is now highlighted (yellow background)
    await expect(page.getByRole('button', { name: 'Chest' })).toHaveClass(/bg-yellow-500/);

    // Verify today's workout cell is now yellow (matches filter)
    await expect(todayCell).toHaveClass(/bg-yellow-500/);

    // Click on Legs filter (deselect Chest, select Legs)
    await page.getByRole('button', { name: 'Chest' }).click(); // deselect Chest
    await page.getByRole('button', { name: 'Legs' }).click();  // select Legs

    // Verify today's workout cell is back to blue (doesn't match Legs filter)
    await expect(todayCell).toHaveClass(/bg-blue-600/);

    // Deselect Legs filter
    await page.getByRole('button', { name: 'Legs' }).click();

    // Verify today's workout cell is still blue (no filter active)
    await expect(todayCell).toHaveClass(/bg-blue-600/);
  });

  test('should return to calendar from day view', async ({ page }) => {
    // Create a workout
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
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for save
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Create second workout for same day to trigger day view
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Squat');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Squat', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '185');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for second workout to be saved
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Navigate to history tab
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Wait for calendar to render with today's workout
    await expect(page.locator('.ring-2.ring-green-400')).toBeVisible({ timeout: 5000 });

    // Click on today to open day view (today has green ring)
    await page.locator('.ring-2.ring-green-400').click();

    // Should be in day view
    await expect(page.getByText('Back to calendar')).toBeVisible();

    // Click back to calendar
    await page.getByText('Back to calendar').click();

    // Should be back to calendar view
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentMonth} ${currentYear}`)).toBeVisible();
  });
});

test.describe('Exercise Rename During Active Workout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Clear any existing tokens and reload
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Generate unique username for each test
    const testUsername = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Register a new user
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', testUsername);
    await page.fill('#auth-password', testPassword);
    await page.click('#auth-submit-btn');

    // Wait for main app to be visible
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('should update current workout when exercise is renamed', async ({ page }) => {
    // Start a workout and add an exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify exercise is in workout
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();

    // Go to Exercises tab and rename the exercise
    await page.getByRole('button', { name: 'Exercises' }).click();
    await page.fill('#exercise-search', 'Bench Press');
    await page.locator('#exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Change the name
    await page.fill('#exercise-name-input', 'Barbell Bench Press');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for save to complete and return to exercise list
    await expect(page.locator('#exercises-list-view')).toBeVisible({ timeout: 5000 });

    // Go back to workout tab
    await page.getByRole('button', { name: 'Workout' }).click();

    // Verify the exercise name was updated in the current workout
    await expect(page.locator('#exercise-list').getByText('Barbell Bench Press')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('Bench Press', { exact: true })).not.toBeVisible();
  });

  test('should calculate PRs correctly after renaming exercise during active workout', async ({ page }) => {
    // First, create a completed workout with "Bench Press" to establish history
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set with 8 reps at 135 lbs
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();

    // Confirm the set
    await page.evaluate(() => (window as any).app.toggleSetCompleted(0, 0));

    // Finish first workout
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible({ timeout: 5000 });

    // Start second workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.fill('#add-exercise-search', 'Bench Press');
    await expect(page.locator('#add-exercise-search-results')).toBeVisible();
    await page.locator('#add-exercise-search-results').getByText('Bench Press', { exact: true }).click();

    // Add a set with 8 reps at 135 lbs (same as before - should NOT be a PR)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();

    // The set should NOT show a PR star (8 reps doesn't beat previous 8 reps)
    // First verify there's no star visible
    const prStars = page.locator('#exercise-list span').filter({ hasText: '★' });
    await expect(prStars).toHaveCount(0);

    // Now rename the exercise while the workout is active
    await page.getByRole('button', { name: 'Exercises' }).click();
    await page.fill('#exercise-search', 'Bench Press');
    await page.locator('#exercise-search-results').getByText('Bench Press', { exact: true }).click();
    await page.fill('#exercise-name-input', 'Barbell Bench Press');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#exercises-list-view')).toBeVisible({ timeout: 5000 });

    // Go back to workout
    await page.getByRole('button', { name: 'Workout' }).click();

    // Verify exercise was renamed
    await expect(page.locator('#exercise-list').getByText('Barbell Bench Press')).toBeVisible();

    // The set should still NOT show a PR star (the history was preserved under the new name)
    const prStarsAfterRename = page.locator('#exercise-list span').filter({ hasText: '★' });
    await expect(prStarsAfterRename).toHaveCount(0);

    // Now add a set that DOES beat the record (10 reps vs previous 8)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // This set should show a PR star (10 reps beats previous 8 reps)
    await expect(page.locator('#exercise-list span.opacity-40').filter({ hasText: '★' })).toBeVisible();
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

    // Register
    const uniqueUser = `user_${Date.now()}`;
    await page.click('#auth-register-tab');
    await page.fill('#auth-username', uniqueUser);
    await page.fill('#auth-password', 'password123');
    await page.click('#auth-submit-btn');

    // Should see main app
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();
  });

  test('should show error for invalid login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Try to login with non-existent user
    await page.fill('#auth-username', 'nonexistent');
    await page.fill('#auth-password', 'wrongpass');
    await page.click('#auth-submit-btn');

    // Should show error
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText('Invalid');
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

    // Go to settings and logout
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();

    // Should show auth screen
    await expect(page.locator('#auth-screen')).toBeVisible();
  });
});
