import { test, expect } from '@playwright/test';

test.describe('Workout Tracker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
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
