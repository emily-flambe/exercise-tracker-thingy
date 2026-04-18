import { test, expect } from '@playwright/test';
import { registerUserViaApi, authenticatePage, TestSetup } from './helpers';

test.describe('Rest Timer', () => {
  let setup: TestSetup;

  test.beforeEach(async ({ page, request }) => {
    setup = await registerUserViaApi(request);
    await authenticatePage(page, setup.token);
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('timer container should be visible when workout is active', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Timer container should be visible during active workout
    await expect(page.locator('#rest-timer-container')).toBeVisible();
    // Timer display should show 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');
  });

  test('timer container should NOT be visible when no workout is active', async ({ page }) => {
    // No workout started - timer container should not be visible
    await expect(page.locator('#rest-timer-container')).not.toBeVisible();
  });

  test('timer should have play, pause, and stop buttons', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Verify play button exists and is visible (timer starts stopped)
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    // Pause and stop buttons should exist but be hidden initially
    await expect(page.locator('#rest-timer-pause-btn')).toBeAttached();
    await expect(page.locator('#rest-timer-stop-btn')).toBeAttached();
  });

  test('clicking play should begin the timer (time increments)', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Verify timer starts at 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');

    // Click play
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment past 00:00
    await expect(page.locator('#rest-timer-display')).not.toHaveText('00:00', { timeout: 5000 });

    // Verify it's in MM:SS format
    const timerText = await page.locator('#rest-timer-display').textContent();
    expect(timerText).toMatch(/^\d{2}:\d{2}$/);
  });

  test('clicking pause should stop the timer', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment past 00:00
    await expect(page.locator('#rest-timer-display')).not.toHaveText('00:00', { timeout: 5000 });

    // Click pause
    await page.locator('#rest-timer-pause-btn').click();

    // Record the time
    const pausedTime = await page.locator('#rest-timer-display').textContent();

    // Wait a bit more to verify timer stays paused
    await page.waitForTimeout(1500);

    // Timer should still show the same time (paused)
    await expect(page.locator('#rest-timer-display')).toHaveText(pausedTime!);
  });

  test('clicking stop should return timer to 00:00', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment past 00:00
    await expect(page.locator('#rest-timer-display')).not.toHaveText('00:00', { timeout: 5000 });

    // Click stop
    await page.locator('#rest-timer-stop-btn').click();

    // Timer should be back to 00:00
    await expect(page.locator('#rest-timer-display')).toHaveText('00:00');
  });

  test('timer should show correct buttons based on state', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Initially: play visible, pause and stop hidden
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).not.toBeVisible();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Running: pause and stop visible, play hidden
    await expect(page.locator('#rest-timer-pause-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rest-timer-stop-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-play-btn')).not.toBeVisible();

    // Wait for the timer to actually advance past 00:00 before pausing.
    // The Paused UI state requires accumulated seconds > 0 for stop-btn to remain
    // visible (see updateTimerButtons in src/frontend/rest-timer.ts); if we pause
    // within the same second as clicking play, accumulated=0 and stop-btn hides.
    await expect(page.locator('#rest-timer-display')).not.toHaveText('00:00', { timeout: 5000 });

    // Pause the timer
    await page.locator('#rest-timer-pause-btn').click();

    // Paused: play and stop visible, pause hidden
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).toBeVisible();

    // Stop the timer
    await page.locator('#rest-timer-stop-btn').click();

    // Stopped: play visible, pause and stop hidden
    await expect(page.locator('#rest-timer-play-btn')).toBeVisible();
    await expect(page.locator('#rest-timer-pause-btn')).not.toBeVisible();
    await expect(page.locator('#rest-timer-stop-btn')).not.toBeVisible();
  });

  test('timer should resume from paused time when play pressed again', async ({ page }) => {
    // Start a workout
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();

    // Start the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to increment past 00:00
    await expect(page.locator('#rest-timer-display')).not.toHaveText('00:00', { timeout: 5000 });

    // Pause the timer
    await page.locator('#rest-timer-pause-btn').click();

    // Record the paused time
    const pausedTime = await page.locator('#rest-timer-display').textContent();
    const parseTime = (time: string) => {
      const [mins, secs] = time.split(':').map(Number);
      return mins * 60 + secs;
    };
    const pausedSeconds = parseTime(pausedTime!);

    // Wait a bit to confirm timer is paused
    await page.waitForTimeout(1000);

    // Resume the timer
    await page.locator('#rest-timer-play-btn').click();

    // Wait for timer to continue beyond paused time
    await page.waitForTimeout(1500);

    // Timer should have continued from paused time
    const resumedTime = await page.locator('#rest-timer-display').textContent();
    const resumedSeconds = parseTime(resumedTime!);

    // Should be greater than paused time
    expect(resumedSeconds).toBeGreaterThan(pausedSeconds);
  });
});
