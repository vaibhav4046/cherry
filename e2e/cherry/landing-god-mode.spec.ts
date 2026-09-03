import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Landing as the open AI workforce: six evidence-led chapters, bounded claims,
 * no fake download, no overflow at desktop and phone widths, keyboard
 * reachability, reduced motion, axe, and clean console.
 * With CHERRY_CAPTURE_VISUAL_EVIDENCE=1 the screenshots land in
 * docs/release/screenshots/god-mode/.
 */

const OUT_DIR = 'docs/release/screenshots/god-mode';
const CAPTURE = process.env.CHERRY_CAPTURE_VISUAL_EVIDENCE === '1';
const RUNNER_PROBE = /^http:\/\/127\.0\.0\.1:\d+\/status$/;
const REQUIRED_HEADINGS = [
  'Describe the result. Cherry forms the team.',
  'Work in parallel without becoming the project manager.',
  'Every worker gets a boundary.',
  'Four artifacts. Four bounded claims.',
  '“Done” is not a result.',
  'Routine work continues. Consequential work comes back to you.',
  'Successful work improves the next mission.',
  'Start with the result you want returned.',
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (RUNNER_PROBE.test(message.location().url)) return; // refused loopback probe, documented
    errors.push(`${message.text()} @ ${message.location().url}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('landing: evidence-led AI workforce', () => {
  test('desktop: copy, sections, statuses, no fake claims, axe clean, no console errors', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = watchConsole(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'One task. An entire AI team.' })).toBeVisible();
    await expect(page.getByText('Real Codex run · separate worktrees · independent checks')).toBeVisible();
    for (const heading of REQUIRED_HEADINGS) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeAttached();
    }
    await expect(page.locator('[data-landing-chapter]')).toHaveCount(6);
    await expect(page.getByTestId('proof-cabinet').locator('[data-verified-demo]')).toHaveCount(4);
    await expect(page.getByText(/Download for Windows/i)).toHaveCount(0);
    await expect(page.getByText(/24\/7/)).toHaveCount(0);
    await expect(page.getByText('Recording · committed evidence · not live', { exact: true })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })))).toEqual([]);
    expect(errors).toEqual([]);

    if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/landing-1440x900.png` : testInfo.outputPath('landing-1440x900.png'), fullPage: true });
  });

  test('mobile 390x844: no horizontal overflow, sections reachable, example labelled', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = watchConsole(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'One task. An entire AI team.' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('heading', { level: 2, name: 'Start with the result you want returned.' }).scrollIntoViewIfNeeded();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('final-action').getByRole('link', { name: 'Open Mission Control' })).toBeVisible();
    expect(errors).toEqual([]);
    if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/landing-390x844.png` : testInfo.outputPath('landing-390x844.png'), fullPage: true });
  });

  test('keyboard: the primary CTA and recorded run are reachable with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const primary = page.getByTestId('hero-actions').getByRole('link', { name: 'Open Mission Control' });
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      if (await primary.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(primary).toBeFocused();
    const outline = await primary.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    const recordedRun = page.getByTestId('hero-actions').getByRole('link', { name: 'Watch 90 seconds' });
    await page.keyboard.press('Tab');
    await expect(recordedRun).toBeFocused();
    expect(await recordedRun.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  });

  test('reduced motion: every chapter is visible without scrolling animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/');
    const chapters = page.locator('[data-landing-chapter]');
    await expect(chapters).toHaveCount(6);
    expect(await chapters.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity))).toEqual([
      '1', '1', '1', '1', '1', '1',
    ]);
    await expect(page.getByRole('region', { name: 'Recorded real Codex run' })).toHaveAttribute('data-playing', 'false');
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
    await context.close();
  });

  test('final action opens Mission Control', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('final-action').getByRole('link', { name: 'Open Mission Control' }).click();
    await expect(page).toHaveURL(/\/studio\/control$/);
    await expect(page.getByRole('heading', { name: 'What should Cherry take care of?' })).toBeVisible();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plan the mission' })).toBeVisible();
  });
});
