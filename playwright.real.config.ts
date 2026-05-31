import { defineConfig } from '@playwright/test';

/**
 * Playwright config for real-backend E2E tests.
 *
 * These tests bypass localStorage mock auth and hit the real API.
 * They require VITE_USE_MOCK_API=false in the dev server environment.
 *
 * Usage:
 *   VITE_USE_MOCK_API=false npx playwright test --config=playwright.real.config.ts
 */
export default defineConfig({
  testDir: './e2e/real-flow',
  fullyParallel: false,        // real-backend tests modify shared state — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // single worker to avoid auth race conditions
  reporter: 'html',
  timeout: 60_000,             // real API calls may be slower
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,  // typically dev server is already running
    timeout: 30_000,
    env: {
      VITE_USE_MOCK_API: 'false',
    },
  },
});
