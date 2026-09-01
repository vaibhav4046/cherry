import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated, opt-in configuration for the uncut product recording.
 *
 * The normal e2e configuration deliberately ignores this paced spec. Run it
 * with `npm run record:demo`; Playwright keeps the resulting `video.webm`
 * beneath `playwright-report/demo-recording/`, then the script promotes the
 * single size-checked file into `public/media/demo/golden-loop.webm`. The
 * separate root prevents a normal e2e run from cleaning the recording first.
 */
export default defineConfig({
  testDir: './e2e/cherry',
  testMatch: /demo-recording\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  outputDir: 'playwright-report/demo-recording',
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'demo-recording',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
