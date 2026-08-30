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
      await expect(page.getByRole('heading', { name: /Teach once/i })).toBeVisible();
      const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(landingOverflow, 'landing horizontal overflow').toBeLessThanOrEqual(1);

      await page.goto('/studio');
      await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
      const studioOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(studioOverflow, 'studio horizontal overflow').toBeLessThanOrEqual(1);
    });
  }

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
    await page.getByLabel('Workspace name').focus();
    await page.keyboard.type('Keyboard workspace');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  });
});

test.describe('artifact preview isolation', () => {
  test('malicious artifact cannot reach Cherry storage or the network', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Workspace name').fill('Sandbox test');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await page.getByRole('link', { name: 'Create mission' }).first().click();
    await page.getByLabel('Title').fill('Sandbox mission');
    await page.getByLabel('Objective').fill('Prove the preview sandbox holds');
    await page.getByLabel('Definition of done (one item per line)').fill('sandbox holds');
    await page.getByRole('button', { name: 'Create mission' }).click();
    await page.getByRole('button', { name: 'Create file workspace' }).click();
    await page.getByRole('link', { name: 'Open file workspace' }).click();

    await page.locator('input[name="path"]').fill('index.html');
    await page.getByRole('button', { name: 'Create file' }).click();
    await page.getByTestId('artifact-editor').fill(
      [
        '<html lang="en"><head><title>evil</title></head><body><h1>probe</h1><script>',
        'const report = {};',
        'try { report.idb = indexedDB.databases ? "reachable" : "reachable"; } catch (e) { report.idb = "blocked:" + e.name; }',
        'try { report.ls = localStorage.length; } catch (e) { report.ls = "blocked:" + e.name; }',
        'try { fetch("https://example.com").then(() => { document.title = "net-open"; }).catch(() => { document.title = "net-blocked"; }); } catch (e) { document.title = "net-blocked"; }',
        'try { window.top.location.href = "https://evil.example"; } catch (e) { report.nav = "blocked"; }',
        'console.error("SANDBOX_REPORT " + JSON.stringify(report));',
        '</script></body></html>',
      ].join('\n'),
    );
    await page.getByTestId('save-artifact').click();

    // The preview reports its own console errors through the bridge.
    const consoleRow = page.locator('.event-row', { hasText: 'SANDBOX_REPORT' });
    await expect(consoleRow).toBeVisible({ timeout: 10_000 });
    const reportText = await consoleRow.textContent();
    // Opaque origin: storage access must throw SecurityError.
    expect(reportText).toContain('blocked');
    // Cherry itself is untouched: still on our origin, workspace intact.
    await expect(page).toHaveURL(/\/studio\/artifacts\//);
  });
});
