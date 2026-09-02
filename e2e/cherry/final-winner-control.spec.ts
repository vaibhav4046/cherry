import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const OUTCOME = 'Research this market and produce an evidence-backed launch brief.';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function stubOfflineRunner(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:47821/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paired: false, version: 'e2e-offline-runner' }),
    });
  });
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious.map((violation) => violation.id)).toEqual([]);
}

test.describe('final winner Mission Control', () => {
  test('fresh IndexedDB reaches a durable mission from one outcome', async ({ page }, testInfo) => {
    const consoleErrors = collectConsoleErrors(page);
    await stubOfflineRunner(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/studio/control');

    await expect(page.getByRole('heading', { level: 1, name: 'What should Cherry take care of?' })).toBeVisible();
    await expect(page.getByLabel('Space name')).toHaveCount(0);
    await expect(page.getByTestId('execution-settings')).not.toHaveAttribute('open', '');
    await page.screenshot({ path: testInfo.outputPath('mission-control-desktop-1440x900.png') });

    await page.getByTestId('outcome-input').fill(OUTCOME);
    await page.getByTestId('plan-mission').click();
    await expect(page).toHaveURL(/\/studio\/control\/ms-/);
    await expect(page.getByTestId('mission-graph')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('mission-graph')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(OUTCOME);
    expect(consoleErrors).toEqual([]);
  });

  test('a recoverable storage error leaves the outcome ready to retry', async ({ page }) => {
    await stubOfflineRunner(page);
    await page.addInitScript(() => {
      const originalAdd = IDBObjectStore.prototype.add;
      let failNextWorkspace = true;
      IDBObjectStore.prototype.add = function add(value: unknown, key?: IDBValidKey) {
        if (failNextWorkspace && this.name === 'workspaces') {
          failNextWorkspace = false;
          throw new DOMException('Simulated workspace write failure', 'QuotaExceededError');
        }
        return key === undefined ? originalAdd.call(this, value) : originalAdd.call(this, value, key);
      };
    });
    await page.goto('/studio/control');

    await page.getByTestId('outcome-input').fill(OUTCOME);
    await page.getByTestId('plan-mission').click();
    await expect(page.getByRole('alert')).toContainText(/could not|failure|try again/i);
    await expect(page.getByTestId('outcome-input')).toHaveValue(OUTCOME);

    await page.getByTestId('plan-mission').click();
    await expect(page).toHaveURL(/\/studio\/control\/ms-/);
  });

  test('recorded replay works without a runner', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/studio/control');
    await page.getByRole('link', { name: /Replay the verified Codex mission/i }).click();
    await expect(page).toHaveURL(/\/showcase#recorded-mission$/);
    expect(consoleErrors).toEqual([]);
  });

  test('390x844 is keyboard-safe, reduced-motion-safe, axe-clean and overflow-free', async ({ page }, testInfo) => {
    const consoleErrors = collectConsoleErrors(page);
    await stubOfflineRunner(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studio/control');

    const settings = page.getByText('Execution settings', { exact: true });
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('execution-settings')).toHaveAttribute('open', '');
    await expect(page.getByTestId('template-select')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mission-control-mobile-390x844.png') });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
    await expectNoSeriousAxeViolations(page);
    expect(consoleErrors).toEqual([]);
  });
});
