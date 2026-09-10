import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'iphone-controls.spec.ts',
  projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 13'] } }],
});
