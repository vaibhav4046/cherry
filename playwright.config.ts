import { defineConfig, devices } from '@playwright/test';

const E2E_PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID?.trim() || 'clp_cherry_e2e_guest_mode';

/**
 * True only when this invocation runs the whole suite, so only a whole-suite run
 * may write the committed JSON report.
 *
 * Everything after `playwright test` that is not a flag is a filename filter, so
 * any positional argument means a subset. `--grep`, `--grep-invert`, `--project`,
 * `--shard` and `--last-failed` narrow it too. `CI` is treated as a full run
 * because the workflow invokes the suite without filters.
 */
function isFullRun(): boolean {
  const argv = process.argv.slice(2);
  // argv[0] is Playwright's own subcommand ("test"), not a filename filter.
  // Treating it as one made every run look filtered, including the full suite,
  // so the report stopped being written at all.
  if (argv[0] === 'test') argv.shift();
  const narrowing = ['--grep', '-g', '--grep-invert', '--project', '--shard', '--last-failed', '--only-changed'];
  for (const arg of argv) {
    if (arg.startsWith('-')) {
      const name = arg.split('=')[0]!;
      if (narrowing.includes(name)) return false;
      continue;
    }
    // A bare word is a test-file filter.
    return false;
  }
  return true;
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: /demo-recording\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  /**
   * Retry once, twice on CI. Two consecutive full runs on this machine failed
   * three and four tests respectively, with almost no overlap between the two
   * sets, and every one of those tests passed when run in isolation immediately
   * afterwards. That is machine load, not defect: the suite already runs serially
   * on a single worker, so the contention comes from whatever else shares the box
   * (a production build, a deploy, another suite).
   *
   * A retried test is reported as `flaky`, never as passed, so the committed
   * report still shows exactly how many needed a second attempt. This makes a
   * loaded run recoverable; it does not make a failing test look green.
   */
  retries: process.env.CI ? 2 : 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // docs/release/e2e-results.json is the submission's browser-suite evidence, and
  // README, the Devpost kit and audit:submission all point at it. Writing it on
  // every invocation meant a filtered run — `playwright test upgrade`, one spec
  // while debugging — silently replaced a whole-suite result with a file
  // recording that almost nothing ran. That happened repeatedly, and the audit
  // only caught it because it fails when a run reports zero tests.
  //
  // So the JSON report is written only by a full run: no positional filter, no
  // --grep, no --project narrowing. Filtered runs still print to the console;
  // they just cannot overwrite the evidence.
  reporter: isFullRun() ? [['list'], ['json', { outputFile: 'docs/release/e2e-results.json' }]] : [['list']],
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
