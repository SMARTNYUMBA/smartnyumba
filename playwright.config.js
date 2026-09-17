// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Smart Nyumba Pro — Playwright E2E Configuration
 *
 * Docs: https://playwright.dev/docs/test-configuration
 *
 * Usage:
 *   npx playwright test                      # run all tests headless
 *   npx playwright test --headed             # watch tests run
 *   npx playwright test --ui                 # interactive UI mode
 *   npx playwright test e2e/critical-path.spec.js  # one file
 *   npx playwright show-report               # open last HTML report
 */

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,          // 60s per test (M-Pesa demo polling needs ~30s)
  expect: { timeout: 8_000 },

  // Retry failed tests once in CI (network flake, slow containers)
  retries: process.env.CI ? 2 : 0,

  // Fail fast in CI after first test file fails
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL:    process.env.FRONTEND_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',   // saves screenshots when a test fails
    video:      'retain-on-failure', // saves video recording on failure
    trace:      'on-first-retry',    // full trace on retry for debugging

    // All requests get this header — matches what the axios client sends
    extraHTTPHeaders: {
      'X-Requested-With': 'XMLHttpRequest',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to add more browsers:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'safari',  use: { ...devices['Desktop Safari']  } },
    // { name: 'mobile',  use: { ...devices['Pixel 5']         } },
  ],

  // Spin up the frontend dev server automatically when running tests locally.
  // Comment this out if you prefer to start the servers manually.
  // webServer: [
  //   {
  //     command: 'cd backend && node server.js',
  //     url: 'http://localhost:3002/api/health',
  //     reuseExistingServer: true,
  //     timeout: 15_000,
  //   },
  //   {
  //     command: 'cd frontend && npm run dev',
  //     url: 'http://localhost:5173',
  //     reuseExistingServer: true,
  //     timeout: 30_000,
  //   },
  // ],
});
