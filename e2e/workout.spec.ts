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
    await expect(page.getByText("Today's Workout")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
  });

  test('should show add exercise screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await expect(page.getByRole('heading', { name: 'Add Exercise' })).toBeVisible();
    await expect(page.locator('#add-exercise-search')).toBeVisible();
  });

  test('should add an exercise to workout', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();
    await expect(page.locator('#exercise-list').getByText('Bench Press')).toBeVisible();
    await expect(page.locator('#exercise-list').getByText('total weight')).toBeVisible();
  });

  test('should navigate between tabs', async ({ page }) => {
    // Check workout tab is active
    await expect(page.getByRole('button', { name: 'Start Workout' })).toBeVisible();

    // Go to history
    await page.getByRole('button', { name: 'History' }).click();
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
    await page.getByRole('button', { name: '+ Add Exercise' }).click();

    // Filter by Push
    await page.getByRole('button', { name: 'Push', exact: true }).click();
    await expect(page.locator('#add-exercise-results').getByText('Bench Press', { exact: true })).toBeVisible();

    // Filter by Pull
    await page.getByRole('button', { name: 'Pull', exact: true }).click();
    await expect(page.locator('#add-exercise-results').getByText('Lat Pulldown')).toBeVisible();
  });
});

test.describe('Auto-save functionality', () => {
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

  test('should auto-save workout when adding an exercise', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();

    // Add an exercise
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Wait for auto-save (1.5s debounce + small buffer)
    await page.waitForTimeout(2000);

    // Navigate to history tab to verify workout was saved
    await page.getByRole('button', { name: 'History' }).click();

    // Should see the auto-saved workout in history
    await expect(page.locator('#history-list')).toContainText('1 exercises');
  });

  test('should auto-save workout when adding a set', async ({ page }) => {
    // Start a workout and add an exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add a set immediately (don't wait for exercise to save first)
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.locator('input[placeholder="wt"]').fill('135');
    await page.locator('input[placeholder="reps"]').fill('10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Navigate to history to verify
    await page.getByRole('button', { name: 'History' }).click();

    // Click on the workout to view details
    await page.locator('#history-list > div').first().click();

    // Verify the set was saved
    await expect(page.locator('#exercise-list')).toContainText('135');
    await expect(page.locator('#exercise-list')).toContainText('10');
  });

  test('should auto-save workout when updating a set', async ({ page }) => {
    // Start a workout, add exercise and set
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.locator('input[placeholder="wt"]').fill('135');
    await page.locator('input[placeholder="reps"]').fill('10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for initial auto-save
    await page.waitForTimeout(2000);

    // Update the weight
    const weightInput = page.locator('#exercise-list input[type="number"]').first();
    await weightInput.fill('145');
    await weightInput.blur();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Refresh page to verify persistence
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    // Go to history and check the updated value
    await page.getByRole('button', { name: 'History' }).click();
    await page.locator('#history-list > div').first().click();

    // Verify the updated weight was saved
    await expect(page.locator('#exercise-list')).toContainText('145');
  });

  test('should auto-save workout when deleting a set', async ({ page }) => {
    // Start a workout, add exercise and two sets
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add first set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.locator('input[placeholder="wt"]').fill('135');
    await page.locator('input[placeholder="reps"]').fill('10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Add second set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.locator('input[placeholder="wt"]').fill('145');
    await page.locator('input[placeholder="reps"]').fill('8');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Delete the first set
    await page.locator('#exercise-list button:has-text("x")').first().click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Go to history and verify only one set remains
    await page.getByRole('button', { name: 'History' }).click();
    await page.locator('#history-list > div').first().click();

    // Should only see the second set
    await expect(page.locator('#exercise-list')).toContainText('145');
    // Verify there's only one set (should only see one set number)
    const setNumbers = await page.locator('#exercise-list .text-gray-400.text-xs').count();
    expect(setNumbers).toBe(1);
  });

  test('should auto-save workout when removing an exercise', async ({ page }) => {
    // Start a workout and add two exercises
    await page.getByRole('button', { name: 'Start Workout' }).click();

    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Squat', { exact: true }).click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Remove the first exercise (need to handle confirm dialog)
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#exercise-list').getByRole('button', { name: 'x' }).first().click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Go to history and verify only one exercise remains
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.locator('#history-list')).toContainText('1 exercises');
  });

  test('should preserve workout after auto-save and page refresh', async ({ page }) => {
    // Start a workout, add exercise and set
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.locator('input[placeholder="wt"]').fill('135');
    await page.locator('input[placeholder="reps"]').fill('10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Refresh the page
    await page.reload();
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });

    // Verify workout is available in history
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.locator('#history-list')).toContainText('Bench Press');

    // Click to edit and verify data
    await page.locator('#history-list > div').first().click();
    await expect(page.locator('#exercise-list')).toContainText('Bench Press');
    await expect(page.locator('#exercise-list')).toContainText('135');
    await expect(page.locator('#exercise-list')).toContainText('10');
  });

  test('should update existing auto-saved workout instead of creating duplicates', async ({ page }) => {
    // Start a workout and add an exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Wait for auto-save
    await page.waitForTimeout(2000);

    // Add multiple sets to trigger multiple auto-saves
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '+ Add set' }).click();
      await page.locator('input[placeholder="wt"]').fill(`${135 + i * 10}`);
      await page.locator('input[placeholder="reps"]').fill('10');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.waitForTimeout(2000);
    }

    // Go to history and verify there's only ONE workout, not multiple
    await page.getByRole('button', { name: 'History' }).click();

    const workoutCards = await page.locator('#history-list > div').count();
    expect(workoutCards).toBe(1);

    // Verify it has all the sets
    await page.locator('#history-list > div').first().click();
    await expect(page.locator('#exercise-list')).toContainText('135');
    await expect(page.locator('#exercise-list')).toContainText('145');
    await expect(page.locator('#exercise-list')).toContainText('155');
  });
});

test.describe('Authentication', () => {
  test('should show login screen by default', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('#auth-login-tab')).toBeVisible();
    await expect(page.locator('#auth-register-tab')).toBeVisible();
  });

  test('should register new user and login', async ({ page }) => {
    // Clear any stored tokens
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
    // Clear any stored tokens
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
    // First register/login
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
