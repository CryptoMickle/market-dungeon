import { defineConfig, devices } from '@playwright/test';

const productionBuild = process.env.PLAYWRIGHT_PRODUCTION === '1';
const port = productionBuild ? 3101 : 3100;

export default defineConfig({
  testDir: './tests/e2e',
  // These require the explicitly enabled Agents edition and run in its own
  // optimized-build CI job, including the real-wallet transport fixtures.
  testIgnore: ['somnia-agents.spec.ts', 'somnia-agents-preview.spec.ts', 'dungeon-home.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run ${productionBuild ? 'start' : 'dev'} -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
