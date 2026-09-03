import { defineConfig, devices } from '@playwright/test';

const E2E_PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID?.trim() || 'clp_cherry_e2e_guest_mode';

export default defineConfig({
  testDir: './e2e',
  testIgnore: /demo-recording\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'docs/release/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1024 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    env: {
      // Proves that a configured auth integration still stays out of the
      // network until the user opens the explicit sign-in surface.
      VITE_PRIVY_APP_ID: E2E_PRIVY_APP_ID,
    },
    reuseExistingServer: !process.env.CI,
    // This starts with a full production build. On a loaded machine that alone
    // can exceed four minutes, and when it does Playwright aborts before a
    // single test runs and overwrites the report with a zero-test result.
    timeout: 900_000,
  },
});
