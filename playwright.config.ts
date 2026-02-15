import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:8787';
const useRemote = !!process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 15000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Skip webServer when using remote BASE_URL
  ...(useRemote ? {} : {
    webServer: {
      command: process.env.CI
        ? 'wrangler dev --local --port 8787'
        : 'npm run dev',
      url: 'http://localhost:8787',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  }),
});
