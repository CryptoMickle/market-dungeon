import { defineConfig, devices } from '@playwright/test';

// The Agents edition is deliberately served from its own, already running
// local process. This suite never launches or changes a hosted deployment.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['somnia-agents.spec.ts', 'dungeon-home.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'agents-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'agents-iphone-webkit', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
  ],
});
