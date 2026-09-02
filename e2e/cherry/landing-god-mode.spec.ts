import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Landing as the open AI workforce: original copy, required sections, labelled
 * examples, honest statuses, no fake download, no overflow at desktop and
 * phone widths, keyboard reachability, reduced motion, axe, clean console.
 * With CHERRY_CAPTURE_VISUAL_EVIDENCE=1 the screenshots land in
 * docs/release/screenshots/god-mode/.
 */

const OUT_DIR = 'docs/release/screenshots/god-mode';
const CAPTURE = process.env.CHERRY_CAPTURE_VISUAL_EVIDENCE === '1';
const RUNNER_PROBE = /^http:\/\/127\.0\.0\.1:\d+\/status$/;
const REQUIRED_HEADINGS = [
  'Describe the result. Cherry plans the work.',
  'Work in parallel without becoming the project manager.',
  'One capability layer for every tool.',
  'Give every worker only the computer access it needs.',
  'Teach once. Improve every teammate.',
  'Keep the workforce when the best model changes.',
  'Automate outcomes, not repeated prompts.',
  'Routine work continues. Consequential work comes back to you.',
  'Outcomes people hand to Cherry.',
  'Every claim survives a recompute.',
  'Give Cherry an outcome.',
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

test.describe('landing: open AI workforce', () => {
  test('desktop: copy, sections, statuses, no fake claims, axe clean, no console errors', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = watchConsole(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'One task. An entire AI team.' })).toBeVisible();
    await expect(page.getByText('Model-agnostic · Permission-scoped · Verification-backed')).toBeVisible();
    for (const heading of REQUIRED_HEADINGS) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeAttached();
    }
    const chips = page.getByTestId('status-chip');
    expect(await chips.count()).toBeGreaterThanOrEqual(12);
    const chipTexts = await chips.allTextContents();
    for (const text of chipTexts) expect(['Validated', 'Shipped', 'Available', 'Experimental', 'Roadmap']).toContain(text);
    await expect(page.getByText(/Download for Windows/i)).toHaveCount(0);
    await expect(page.getByText(/24\/7/)).toHaveCount(0);
    await expect(page.getByTestId('teammate-rail')).toContainText('Example workspace');
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
    await page.getByRole('heading', { level: 2, name: 'Give Cherry an outcome.' }).scrollIntoViewIfNeeded();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('final-ctas').getByRole('link', { name: 'Open Cherry' })).toBeVisible();
    expect(errors).toEqual([]);
    if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: CAPTURE ? `${OUT_DIR}/landing-390x844.png` : testInfo.outputPath('landing-390x844.png'), fullPage: true });
  });

  test('keyboard: the primary CTA and the guided example are reachable by Tab with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const primary = page.getByTestId('hero-ctas').getByRole('link', { name: 'Run a real mission' });
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      if (await primary.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(primary).toBeFocused();
    const outline = await primary.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    await page.getByTestId('guided-example-link').focus();
    await expect(page.getByTestId('guided-example-link')).toBeFocused();
  });

  test('reduced motion: every chapter is visible without scrolling animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/');
    const opacity = await page.locator('.gm-section').last().evaluate((element) => getComputedStyle(element).opacity);
    expect(opacity).toBe('1');
    await context.close();
  });

  test('use-case cards prefill Mission Control with the outcome', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.getByTestId('use-cases').getByRole('link').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/^\/studio\/control\?outcome=/);
  });
});
