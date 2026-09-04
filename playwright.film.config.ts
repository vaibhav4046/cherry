import { defineConfig, devices } from '@playwright/test';

/**
 * Opt-in configuration for the product film.
 *
 * Separate from the demo-recording config so a normal e2e run never cleans the
 * footage, and separate from the default e2e config so a paced 4-minute take
 * never blocks the gates. Run it with `npm run record:film`.
 */
export default defineConfig({
  testDir: './e2e/cherry',
  testMatch: /demo-agent-journey\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  outputDir: 'playwright-report/film',
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
  },
  projects: [{ name: 'film', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
