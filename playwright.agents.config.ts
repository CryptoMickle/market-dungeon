import { defineConfig, devices } from '@playwright/test';

const productionBuild = process.env.PLAYWRIGHT_PRODUCTION === '1';
const productionPort = 3102;
if (productionBuild && process.env.MARKET_DUNGEON_LOCAL_AGENTS !== '1') {
  throw new Error('Agents production-build tests require MARKET_DUNGEON_LOCAL_AGENTS=1 during both build and test.');
}

// Ordinary local use reuses the Agents development process. CI starts a
// separate optimized local build with its own explicit Agents opt-in.
// All agent requests and wallet sends in this suite are controlled fixtures.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['somnia-agents.spec.ts', 'somnia-agents-preview.spec.ts', 'dungeon-home.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: productionBuild ? `http://127.0.0.1:${productionPort}` : 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'agents-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'agents-iphone-webkit', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
  ],
  ...(productionBuild ? { webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${productionPort}`,
    url: `http://127.0.0.1:${productionPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  } } : {}),
});
