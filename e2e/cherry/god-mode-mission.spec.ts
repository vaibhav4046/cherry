import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The whole loop in a browser against a real local runner started with the
 * test-only mock host: outcome -> validated graph -> two workers overlap in
 * separate sandboxes -> one forced check failure -> one bounded repair ->
 * every required check passes -> the human decides the publish node -> Done.
 * Also: no runner is honest, reload keeps state, cancel works, mobile has no
 * overflow, axe is clean, console is clean.
 */

const PAIR_TOKEN = 'e2e-pair-token-0123456789';
const RUNNER_PROBE = /^http:\/\/127\.0\.0\.1:\d+\/status$/;
const OUT_DIR = 'docs/release/screenshots/god-mode';
const CAPTURE = process.env.CHERRY_CAPTURE_VISUAL_EVIDENCE === '1';
const RUNNER_ORIGIN = 'http://127.0.0.1:47821';
const OUTCOME = 'Audit Cherry against its strongest competitor, fix the highest-impact onboarding defect, and prepare the launch content. Nothing public without approval.';

/** Waits for the mission to be working; a refusal fails fast with the exact message the person saw. */
async function expectStarted(page: Page): Promise<void> {
  const error = page.getByTestId('mission-error');
  await Promise.race([
    page.getByTestId('mission-status').filter({ hasText: 'Working' }).waitFor({ timeout: 20_000 }),
    error.waitFor({ timeout: 20_000 }).then(async () => {
      throw new Error(`start refused: ${await error.textContent()}`);
    }),
  ]);
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (RUNNER_PROBE.test(message.location().url)) return;
    errors.push(`${message.text()} @ ${message.location().url}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function pair(page: Page) {
  await page.addInitScript((token) => sessionStorage.setItem('cherry.runner.pairToken', token), PAIR_TOKEN);
}

/** A tiny git repository with one passing test, so the verify node's `node --test` has something real to run. */
function createFixtureRepo(root: string): string {
  const repo = join(root, 'fixture-repo');
  mkdirSync(repo, { recursive: true });
  writeFileSync(
    join(repo, 'fixture.test.mjs'),
    ["import { test } from 'node:test';", "import assert from 'node:assert/strict';", "test('fixture passes', () => assert.equal(1 + 1, 2));", ''].join('\n'),
  );
  writeFileSync(join(repo, 'README.md'), 'Fixture repository for the Cherry mission end-to-end test.\n');
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git(['init', '-q']);
  git(['-c', 'user.email=e2e@cherry.local', '-c', 'user.name=Cherry e2e', 'add', '.']);
  git(['-c', 'user.email=e2e@cherry.local', '-c', 'user.name=Cherry e2e', 'commit', '-q', '-m', 'fixture']);
  return repo;
}

function startRunner(root: string): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ['runner/server.mjs', '--root', root, '--state', join(root, '.state'), '--allow-exec', process.execPath, '--allow-mock-host', '--mock-fail-first', 'content-draft', '--mock-delay-ms', '8000', '--concurrency', '3'],
    { env: { ...process.env, CHERRY_RUNNER_TOKEN: PAIR_TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`runner did not start: ${output.slice(-600)}`)), 20_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => reject(new Error(`runner exited early with ${code}: ${output.slice(-600)}`)));
  });
}

test.describe('Mission Control without a runner', () => {
  test('plans a mission from an outcome, refuses to start honestly, keeps it across reload, cancels', async ({ page }, testInfo) => {
    const errors = watchConsole(page);
    await page.goto('/studio/control');
    await page.getByLabel('Space name').fill('Missions e2e');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'What should Cherry take care of?' })).toBeVisible();
    if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/control-empty.png` : testInfo.outputPath('control-empty.png'), fullPage: true });

    await page.getByTestId('outcome-input').fill(OUTCOME);
    await page.getByTestId('plan-mission').click();
    await expect(page).toHaveURL(/\/studio\/control\/ms-/);
    await expect(page.getByTestId('mission-status')).toHaveText('Planned');
    const nodes = page.getByTestId('mission-node');
    expect(await nodes.count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId('mission-node').filter({ hasText: 'Publish approval' })).toContainText('human decision');

    // Approval comes first: the release mission carries consequential work, so an unapproved start is refused.
    await page.getByTestId('start-mission').click();
    await expect(page.getByTestId('mission-error')).toContainText(/approve/i);
    await page.getByTestId('approve-plan').click();
    await expect(page.getByText(/Approved at r\d+/)).toBeVisible();

    // Honest refusal: no runner is paired in this browser.
    await page.getByTestId('start-mission').click();
    await expect(page.getByTestId('mission-error')).toContainText(/runner/i);

    // Reload keeps the plan.
    await page.reload();
    await expect(page.getByTestId('mission-status')).toHaveText('Planned');
    await expect(page.getByTestId('mission-graph')).toBeVisible();

    await page.getByTestId('cancel-mission').click();
    await expect(page.getByTestId('mission-status')).toHaveText('Cancelled');
    await page.goto('/studio/control');
    await expect(page.getByTestId('column-completed')).toContainText('Cancelled');

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keyboard: the composer submits with Enter on the button and mobile has no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studio/control');
    await page.getByLabel('Space name').fill('Keyboard e2e');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('outcome-composer')).toBeVisible();
    await page.getByTestId('outcome-input').focus();
    await page.keyboard.type('Research this market and produce an evidence-backed launch brief.');
    await page.getByTestId('plan-mission').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/studio\/control\/ms-/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Mission Control with a paired mock runner', () => {
  let runner: ChildProcess | null = null;
  let root = '';
  let repo = '';

  test.beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'cherry-gm-e2e-'));
    repo = createFixtureRepo(root);
    runner = await startRunner(root);
  });

  test.afterAll(async () => {
    runner?.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows file locks */
    }
  });

  test('two workers overlap, a failed check repairs once, the human decides, the mission completes', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchConsole(page);
    await pair(page);
    await page.goto('/studio/control');
    await page.getByLabel('Space name').fill('Runner e2e');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByTestId('runner-line')).toContainText('Runner paired');

    await page.getByTestId('outcome-input').fill(OUTCOME);
    await page.getByTestId('repository-input').fill(repo);
    await page.getByTestId('plan-mission').click();
    await expect(page).toHaveURL(/\/studio\/control\/ms-/);

    // The release mission carries a human decision node, so a person approves the exact revision first.
    await page.getByTestId('approve-plan').click();
    await expect(page.getByText(/Approved at r\d+/)).toBeVisible();
    await page.getByTestId('start-mission').click();
    await expectStarted(page);
    await page.getByTestId('live-sync').check();

    // Parallel proof in the UI: two nodes running at once, in different sandboxes.
    await expect.poll(async () => page.locator('[data-node-status="running"]').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    const roots = await page.locator('[data-node-status="running"]').allTextContents();
    expect(new Set(roots.map((text) => text.match(/Workspace: ([^\s]+)/)?.[1] ?? '')).size).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/control-running.png` : testInfo.outputPath('control-running.png'), fullPage: true });

    // The forced failure on content-draft produces one repair and then passes.
    await expect.poll(async () => page.locator('[data-node-id="content-draft"]').getAttribute('data-node-status'), { timeout: 90_000 }).toBe('succeeded');
    await expect(page.locator('[data-node-id="content-draft"]')).toContainText('attempt 2 of');

    // The publish node needs a person.
    await expect.poll(async () => page.locator('[data-node-id="publish-approval"]').getAttribute('data-node-status'), { timeout: 90_000 }).toBe('waiting_for_human');
    await expect(page.getByTestId('mission-status')).toHaveText('Needs you');
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/control-needs-you.png` : testInfo.outputPath('control-needs-you.png'), fullPage: true });
    await page.getByTestId('decide-approve').click();

    await expect.poll(async () => page.getByTestId('mission-status').textContent(), { timeout: 60_000 }).toBe('Done');
    await expect(page.getByTestId('mission-graph')).toContainText('worktree-process');
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/control-complete.png` : testInfo.outputPath('control-complete.png'), fullPage: true });

    // Provider completion never counted as success: every succeeded node carries checks.
    const doneNodes = page.locator('[data-node-status="succeeded"]');
    expect(await doneNodes.count()).toBeGreaterThanOrEqual(5);
    expect(await page.getByTestId('node-checks').count()).toBeGreaterThanOrEqual(4);

    // Measured overlap from the runner's own record: two nodes were running at the same time.
    const listed = await fetch(`${RUNNER_ORIGIN}/v2/missions`, { headers: { 'x-cherry-pair': PAIR_TOKEN } }).then((response) => response.json() as Promise<{ missions: Array<{ id: string }> }>);
    expect(listed.missions.length).toBe(1);
    const recorded = await fetch(`${RUNNER_ORIGIN}/v2/missions/${listed.missions[0]!.id}`, { headers: { 'x-cherry-pair': PAIR_TOKEN } }).then((response) => response.json() as Promise<{ mission: { nodes: Record<string, { startedAt: string | null; finishedAt: string | null; sandbox: { root: string; boundary: string } | null }> } }>);
    const intervals = Object.entries(recorded.mission.nodes).filter(([, node]) => node.startedAt && node.finishedAt).map(([id, node]) => ({ id, start: Date.parse(node.startedAt!), end: Date.parse(node.finishedAt!) }));
    const overlapping = intervals.filter((a) => intervals.some((b) => a.id !== b.id && a.start < b.end && b.start < a.end)).map((interval) => interval.id);
    expect(overlapping.length).toBeGreaterThanOrEqual(2);
    const sandboxRoots = new Set(Object.values(recorded.mission.nodes).map((node) => node.sandbox?.root).filter(Boolean));
    expect(sandboxRoots.size).toBeGreaterThanOrEqual(2);
    expect(Object.values(recorded.mission.nodes).some((node) => node.sandbox?.boundary === 'worktree-process')).toBe(true);
    testInfo.annotations.push({ type: 'parallel-overlap', description: overlapping.join(', ') });

    // Activity shows the runner and the person, and a reload keeps everything.
    await expect(page.getByTestId('mission-activity')).toContainText('runner');
    await page.reload();
    await expect(page.getByTestId('mission-status')).toHaveText('Done');
    expect(errors).toEqual([]);
  });
});
