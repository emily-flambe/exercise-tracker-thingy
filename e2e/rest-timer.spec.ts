import { test, expect } from '@playwright/test';

const testPassword = 'testpass123';

test.describe('Rest Timer', () => {
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

  test('timer container should be visible when workout is active', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Timer container is inline in the workout header and should be visible
    await expect(page.locator('#rest-timer-container')).toBeVisible();
  });

  test('timer container should NOT be visible when no workout is active', async ({ page }) => {
    // No workout started - #workout-active is hidden, so its children are not visible
    await expect(page.locator('#rest-timer-container')).not.toBeVisible();
  });

  test('timer shows initial state with 00:00 and only play button visible', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Display should show 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');

    // Only play button should be visible (stopped state: seconds=0)
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).not.toBeVisible();
  });

  test('start timer increments display beyond 00:00', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Verify initial state
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');

    // Click play to start timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for at least one tick
    await page.waitForTimeout(1100);

    // Timer should have incremented past 00:00
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).not.toBe('00:00');
    // Verify MM:SS format
    expect(timerText).toMatch(/^\d{2}:\d{2}$/);
  });

  test('pause stops the timer from incrementing', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(1100);

    // Pause the timer
    await page.locator('#rest-timer-pause-btn').click();

    // Record the paused time
    const pausedTime = await page.locator('#rest-timer-display').textContent();

    // Wait and verify time hasn't changed
    await page.waitForTimeout(1100);

    await expect(page.locator('#rest-timer-display')).toHaveText(pausedTime!);
  });

  test('stop resets timer to 00:00', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(1100);

    // Verify timer is not 00:00
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).not.toBe('00:00');

    // Click stop
    await page.locator('#rest-timer-stop-btn').click();

    // Timer should be back to 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');
  });

  test('button states when running: play hidden, pause visible, stop visible', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Click play to start timer
    await page.locator('#rest-timer-play-btn').click();

    // Running state: play hidden, pause visible, stop visible
    await expect(page.locator('#rest-timer-play-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).toBeVisible();
  });

  test('button states when paused: play visible, pause hidden, stop visible', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start timer then pause
    await page.locator('#rest-timer-play-btn').click();
    await page.waitForTimeout(1100);
    await page.locator('#rest-timer-pause-btn').click();

    // Paused state (seconds > 0, not running): play visible, pause hidden, stop visible
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).toBeVisible();
  });

  test('button states after stop: play visible, pause hidden, stop hidden', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start timer, wait, then stop
    await page.locator('#rest-timer-play-btn').click();
    await page.waitForTimeout(1100);
    await page.locator('#rest-timer-stop-btn').click();

    // Stopped state (seconds=0): play visible, pause hidden, stop hidden
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).not.toBeVisible();
  });
});
