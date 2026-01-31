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

  test('timer button should be visible when workout is active', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Timer button should be visible during active workout
    await expect(page.locator('#rest-timer-btn')).toBeVisible();
  });

  test('timer button should NOT be visible when no workout is active', async ({ page }) => {
    // No workout started - timer button should not be visible
    await expect(page.locator('#rest-timer-btn')).not.toBeVisible();
  });

  test('clicking timer button should open the timer modal', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Click timer button
    await page.locator('#rest-timer-btn').click();

    // Timer modal should be visible
    await expect(page.locator('#rest-timer-modal')).toBeVisible();
    // Should show the timer display in MM:SS format
    await expect(page.locator('#rest-timer-display')).toBeVisible();
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');
  });

  test('timer modal should have start, pause, and reset buttons', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();
    await expect(page.locator('#rest-timer-modal')).toBeVisible();

    // Verify all control buttons exist
    await expect(page.locator('#rest-timer-start-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-reset-btn')).toBeVisible();
  });

  test('clicking start should begin the timer (time increments)', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();
    await expect(page.locator('#rest-timer-modal')).toBeVisible();

    // Verify timer starts at 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');

    // Click start
    await page.locator('#rest-timer-start-btn').click();

    // Wait a bit and verify timer has incremented
    await page.waitForTimeout(1500);

    // Timer should show at least 00:01
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).not.toBe('00:00');
    // Verify it's in MM:SS format
    expect(timerText).toMatch(/^\d{2}:\d{2}$/);
  });

  test('clicking pause should stop the timer', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();

    // Start the timer
    await page.locator('#rest-timer-start-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(1500);

    // Click pause
    await page.locator('#rest-timer-pause-btn').click();

    // Record the time
    const pausedTime = await page.locator('#rest-timer-display').textContent();

    // Wait a bit more
    await page.waitForTimeout(1500);

    // Timer should still show the same time (paused)
    await expect(page.locator('#rest-timer-display')).toHaveText(pausedTime!);
  });

  test('clicking reset should return timer to 00:00', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();

    // Start the timer
    await page.locator('#rest-timer-start-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(1500);

    // Verify timer is not 00:00
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).not.toBe('00:00');

    // Click reset
    await page.locator('#rest-timer-reset-btn').click();

    // Timer should be back to 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');
  });

  test('closing modal should NOT stop the timer', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();

    // Start the timer
    await page.locator('#rest-timer-start-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(1200);

    // Record the approximate time
    const timeBeforeClose = await page.locator('#rest-timer-display').textContent();

    // Close the modal (click close button or outside)
    await page.locator('#rest-timer-close-btn').click();

    // Modal should be hidden
    await expect(page.locator('#rest-timer-modal')).not.toBeVisible();

    // Wait a bit while modal is closed
    await page.waitForTimeout(2000);

    // Reopen modal
    await page.locator('#rest-timer-btn').click();

    // Timer should have continued running (should be greater than before)
    const timeAfterReopen = await page.locator('#rest-timer-display').textContent();

    // Parse times to compare (MM:SS format)
    const parseTime = (time: string) => {
      const [mins, secs] = time.split(':').map(Number);
      return mins * 60 + secs;
    };

    const secondsBeforeClose = parseTime(timeBeforeClose!);
    const secondsAfterReopen = parseTime(timeAfterReopen!);

    // Timer should have continued (at least 1 second more)
    expect(secondsAfterReopen).toBeGreaterThan(secondsBeforeClose);
  });

  test('reopening modal should show current timer state', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();

    // Start the timer
    await page.locator('#rest-timer-start-btn').click();

    // Wait for timer to increment
    await page.waitForTimeout(2000);

    // Close the modal
    await page.locator('#rest-timer-close-btn').click();
    await expect(page.locator('#rest-timer-modal')).not.toBeVisible();

    // Reopen the modal
    await page.locator('#rest-timer-btn').click();
    await expect(page.locator('#rest-timer-modal')).toBeVisible();

    // Timer display should show elapsed time (not 00:00)
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).not.toBe('00:00');

    // Should be at least 2 seconds
    const [mins, secs] = timerText!.split(':').map(Number);
    const totalSeconds = mins * 60 + secs;
    expect(totalSeconds).toBeGreaterThanOrEqual(2);
  });

  test('timer button should show running indicator when timer is active but modal closed', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Timer button should not have running indicator initially
    await expect(page.locator('#rest-timer-btn[data-running="true"]')).not.toBeVisible();
    await expect(page.locator('#rest-timer-btn .timer-running-indicator')).not.toBeVisible();

    // Open timer modal
    await page.locator('#rest-timer-btn').click();

    // Start the timer
    await page.locator('#rest-timer-start-btn').click();

    // Wait briefly
    await page.waitForTimeout(500);

    // Close the modal
    await page.locator('#rest-timer-close-btn').click();
    await expect(page.locator('#rest-timer-modal')).not.toBeVisible();

    // Timer button should now show running indicator
    // This could be a data attribute, a CSS class, or a visual element
    const timerBtn = page.locator('#rest-timer-btn');
    
    // Check for running indicator (could be implemented various ways)
    const hasRunningAttribute = await timerBtn.getAttribute('data-running');
    const hasRunningIndicator = await page.locator('#rest-timer-btn .timer-running-indicator').isVisible().catch(() => false);
    const hasRunningClass = await timerBtn.evaluate(el => el.classList.contains('timer-running'));

    // At least one of these indicators should be true
    expect(hasRunningAttribute === 'true' || hasRunningIndicator || hasRunningClass).toBeTruthy();
  });
});
