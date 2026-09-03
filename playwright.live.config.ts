import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.LIVE_SMOKE_BASE_URL ?? 'https://market-dungeon.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-live', use: { ...devices['Desktop Chrome'] } },
  ],
});
