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
    await expect(page.locator('#exercise-list').getByText('+bar weight')).toBeVisible();
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

  test('should add a set to an exercise', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

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
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

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
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

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
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

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
