import { expect, test } from '@playwright/test';

test.describe('memory and routine surfaces', () => {
  test('unknown routes render a not-found page', async ({ page }) => {
    await page.goto('/definitely-not-a-cherry-route');
    await expect(page.getByRole('heading', { name: /This page is missing/i })).toBeVisible();
  });

  test('memory vault exposes graph fallback and no overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studio/memory');
    await expect(page.getByRole('heading', { name: 'Memory Vault' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Memory graph' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
