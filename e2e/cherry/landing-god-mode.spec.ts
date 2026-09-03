import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Landing in plain first-time language: six evidence-led chapters,
 * no fake download, no overflow at desktop and phone widths, keyboard
 * reachability, reduced motion, axe, and clean console.
 * With CHERRY_CAPTURE_VISUAL_EVIDENCE=1 the screenshots land in
 * docs/release/screenshots/god-mode/.
 */

const OUT_DIR = 'docs/release/screenshots/god-mode';
const CAPTURE = process.env.CHERRY_CAPTURE_VISUAL_EVIDENCE === '1';
const RUNNER_PROBE = /^http:\/\/127\.0\.0\.1:\d+\/status$/;
const REQUIRED_HEADINGS = [
  'Describe the goal. Review the plan.',
  'Independent tasks can run at the same time.',
  'Each task gets its own work area.',
  'Four demos. Each shows what Cherry actually did.',
  'Work is complete only when its checks pass.',
  'Cherry pauses when your approval is required.',
  'Save approved methods as reusable skills.',
  'What should Cherry take care of?',
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
    const recordedSummary = page.getByLabel('Recorded run summary');
    await expect(recordedSummary).toContainText('2 tasks');
    await expect(recordedSummary).toContainText('34.5 seconds together');
    await expect(recordedSummary).toContainText('2 checks passed');
    for (const heading of REQUIRED_HEADINGS) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeAttached();
    }
    await expect(page.locator('[data-landing-chapter]')).toHaveCount(6);
    await expect(page.getByTestId('proof-cabinet').locator('[data-verified-demo]')).toHaveCount(4);
    await expect(page.getByText(/Download for Windows/i)).toHaveCount(0);
    await expect(page.getByText(/24\/7/)).toHaveCount(0);
    await expect(page.getByText('Recorded run · verified before display · not live', { exact: true })).toBeVisible();
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
    await expect(page.locator('.landing-header')).toHaveCSS('position', 'sticky');
    const menu = page.locator('.landing-nav__menu');
    const menuSummary = menu.locator('summary');
    await menuSummary.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    const howItWorks = menu.getByRole('link', { name: 'How it works' });
    await expect(howItWorks).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Recorded run' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Compatibility' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(howItWorks).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(menuSummary).toBeFocused();
    await page.keyboard.press('Enter');
    await howItWorks.click();
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(page).toHaveURL(/#seed$/);

    const heroActions = page.getByTestId('hero-actions').getByRole('link');
    await expect(heroActions).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await heroActions.nth(index).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(340);
    }

    const visibleReplayControls = page.getByRole('region', { name: 'Recorded real Codex run' })
      .locator('.recorded-mission__controls button:visible');
    await expect(visibleReplayControls).toHaveCount(6);
    for (const name of ['Play', 'Pause', 'Restart', 'Previous step', 'Next step', 'Open evidence']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Previous step', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Previous step', exact: true })).toBeDisabled();
    for (let index = 0; index < 6; index += 1) {
      expect((await visibleReplayControls.nth(index).boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('heading', { level: 2, name: 'What should Cherry take care of?' }).scrollIntoViewIfNeeded();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('final-action').getByRole('link', { name: 'Plan a project' })).toBeVisible();
    expect(errors).toEqual([]);
    if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/landing-390x844.png` : testInfo.outputPath('landing-390x844.png'), fullPage: true });
  });

  test('tablet 768px: proof cards stay readable and summary links reach real chapters', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const summaryLinks = page.getByLabel('Recorded run summary').getByRole('link');
    await expect(summaryLinks).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const href = await summaryLinks.nth(index).getAttribute('href');
      expect(href).toMatch(/^#[a-z-]+$/);
      await expect(page.locator(href!)).toHaveCount(1);
    }

    const proofCards = page.getByTestId('proof-cabinet').locator('[data-verified-demo]');
    await expect(proofCards).toHaveCount(4);
    for (let index = 1; index < 4; index += 1) {
      expect((await proofCards.nth(index).boundingBox())?.width).toBeGreaterThanOrEqual(190);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test('keyboard: the primary CTA and recorded run are reachable with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const primary = page.getByTestId('hero-actions').getByRole('link', { name: 'Plan a project' });
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      if (await primary.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(primary).toBeFocused();
    const outline = await primary.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    const recordedRun = page.getByTestId('hero-actions').getByRole('link', { name: 'See the recorded run' });
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
    await page.getByTestId('final-action').getByRole('link', { name: 'Plan a project' }).click();
    await expect(page).toHaveURL(/\/studio\/control$/);
    await expect(page.getByRole('heading', { name: 'What should Cherry take care of?' })).toBeVisible();
    await expect(page.getByText('Outcome', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plan the mission' })).toBeVisible();
  });
});
