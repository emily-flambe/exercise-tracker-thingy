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

    // Filter by Chest
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await expect(page.locator('#add-exercise-results').getByText('Bench Press', { exact: true })).toBeVisible();

    // Filter by Back
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#add-exercise-results').getByText('Lat Pulldown')).toBeVisible();
  });

  test('should show pencil icon for notes instead of always-visible field', async ({ page }) => {
    // Start workout and add exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Should see the pencil icon
    const pencilIcon = page.locator('button[title="Add note"]').first();
    await expect(pencilIcon).toBeVisible();

    // Should NOT see the notes input field initially
    const noteField = page.locator('input[placeholder="note"]').first();
    await expect(noteField).not.toBeVisible();
  });

  test('should expand notes field when pencil icon is clicked', async ({ page }) => {
    // Start workout and add exercise
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
    const noteField = page.locator('input[placeholder="note"]').first();
    await expect(noteField).toBeVisible();
  });

  test('should collapse notes field when pencil icon is clicked again', async ({ page }) => {
    // Start workout and add exercise
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
    await expect(page.locator('input[placeholder="note"]').first()).toBeVisible();

    // Click again to collapse
    await page.locator('button[title="Add note"]').first().click();
    await expect(page.locator('input[placeholder="note"]').first()).not.toBeVisible();
  });

  test('should save note and change pencil icon color to blue', async ({ page }) => {
    // Start workout and add exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Click pencil icon to expand notes
    const pencilButton = page.locator('button[title="Add note"]').first();
    await pencilButton.click();

    // Add a note
    const noteField = page.locator('input[placeholder="note"]').first();
    await noteField.fill('felt strong today');
    await noteField.blur(); // Trigger onchange

    // Wait for the re-render
    await page.waitForTimeout(500);

    // Pencil icon should now have "Edit note" title and blue color
    const editButton = page.locator('button[title="Edit note"]').first();
    await expect(editButton).toBeVisible();

    // Check that the button has the blue color class
    const hasBlueClass = await editButton.evaluate((el) => {
      return el.className.includes('text-blue-400');
    });
    expect(hasBlueClass).toBe(true);
  });

  test('should persist note after collapsing and re-expanding', async ({ page }) => {
    // Start workout and add exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Expand and add note
    await page.locator('button[title="Add note"]').first().click();
    const noteField = page.locator('input[placeholder="note"]').first();
    await noteField.fill('test note');
    await noteField.blur();

    // Wait for save
    await page.waitForTimeout(500);

    // Collapse
    await page.locator('button[title="Edit note"]').first().click();
    await expect(page.locator('input[placeholder="note"]').first()).not.toBeVisible();

    // Re-expand
    await page.locator('button[title="Edit note"]').first().click();

    // Note should still be there
    const noteFieldAgain = page.locator('input[placeholder="note"]').first();
    await expect(noteFieldAgain).toHaveValue('test note');
  });

  test('should handle multiple sets with different note states', async ({ page }) => {
    // Start workout and add exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add first set with note
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.locator('button[title="Add note"]').first().click();
    await page.locator('input[placeholder="note"]').first().fill('set 1 note');
    await page.locator('input[placeholder="note"]').first().blur();
    await page.waitForTimeout(300);

    // Add second set without note
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '8');
    await page.getByRole('button', { name: 'Save' }).click();

    // First set should have blue pencil (with note)
    const firstSetEditButton = page.locator('button[title="Edit note"]').first();
    await expect(firstSetEditButton).toBeVisible();

    // Second set should have gray pencil (without note)
    const secondSetAddButton = page.locator('button[title="Add note"]').last();
    await expect(secondSetAddButton).toBeVisible();

    // Verify color classes
    const firstHasBlue = await firstSetEditButton.evaluate((el) => {
      return el.className.includes('text-blue-400');
    });
    expect(firstHasBlue).toBe(true);

    const secondHasGray = await secondSetAddButton.evaluate((el) => {
      return el.className.includes('text-gray-500');
    });
    expect(secondHasGray).toBe(true);
  });

  test('should show save feedback when adding a set during workout', async ({ page }) => {
    // Start workout and add exercise
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Add a set
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for auto-save to trigger (1.5s delay)
    await page.waitForTimeout(1600);

    // Toast should be visible
    const toast = page.locator('#save-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Saved');

    // Toast should fade out after 2 seconds
    await page.waitForTimeout(2500);
    await expect(toast).not.toBeVisible();
  });

  test('should show save feedback when updating a set', async ({ page }) => {
    // Start workout and add exercise with a set
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for initial auto-save to complete
    await page.waitForTimeout(2000);

    // Update the weight
    const weightInput = page.locator('input[type="number"]').first();
    await weightInput.fill('145');
    await weightInput.blur();

    // Wait for auto-save to trigger
    await page.waitForTimeout(1600);

    // Toast should be visible
    const toast = page.locator('#save-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Saved');
  });

  test('should show save feedback when adding an exercise', async ({ page }) => {
    // Start workout
    await page.getByRole('button', { name: 'Start Workout' }).click();

    // Add an exercise
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();

    // Wait for auto-save to trigger
    await page.waitForTimeout(1600);

    // Toast should be visible
    const toast = page.locator('#save-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Saved');
  });

  test('should show save feedback when toggling set completion', async ({ page }) => {
    // Start workout and add exercise with a set
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: '+ Add Exercise' }).click();
    await page.locator('#add-exercise-results').getByText('Bench Press', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add set' }).click();
    await page.fill('input[placeholder="wt"]', '135');
    await page.fill('input[placeholder="reps"]', '10');
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for initial auto-save to complete and toast to disappear
    await page.waitForTimeout(4000);

    // Toggle set completion
    const setCheckbox = page.locator('button').filter({ has: page.locator('svg circle') }).first();
    await setCheckbox.click();

    // Wait for auto-save to trigger
    await page.waitForTimeout(1600);

    // Toast should be visible
    const toast = page.locator('#save-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Saved');
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
