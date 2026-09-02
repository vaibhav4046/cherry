import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('the 90-second judge path on /showcase', () => {
  test('renders on a fresh visit with four real steps, dismisses and restores across reloads', async ({ page }) => {
    await page.goto('/showcase');
    const card = page.getByTestId('showcase-judge-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Judging Cherry? The 90-second path');
    await expect(card.getByTestId('judge-step-library')).toBeEnabled();
    await expect(card.getByTestId('judge-step-creators')).toHaveAttribute('href', '/studio/creators');
    await expect(card.getByTestId('judge-step-approve')).toHaveAttribute('href', '/studio/quick');
    await expect(card.getByTestId('judge-step-proof')).toHaveAttribute('href', '/studio/proof');
    // One judge surface, not two.
    await expect(page.getByTestId('showcase-judge-script')).toHaveCount(0);

    // Step 1 is the real loader: the sample library lands and Creators shows the sample creator.
    await card.getByTestId('judge-step-library').click();
    await expect(page).toHaveURL(/\/studio\/skills$/);
    await expect(page.getByTestId('library-card')).toHaveCount(8);
    await page.goto('/studio/creators');
    await expect(page.getByTestId('creator-row')).toHaveCount(1);

    // Dismissal is remembered in this browser only.
    await page.goto('/showcase');
    await card.getByTestId('showcase-judge-card-dismiss').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('showcase-judge-card-restore')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('showcase-judge-card')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('cherry.showcase.judgeCard.dismissed'))).toBe('1');

    await page.getByTestId('showcase-judge-card-restore').click();
    await expect(page.getByTestId('showcase-judge-card')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('showcase-judge-card')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('cherry.showcase.judgeCard.dismissed'))).toBeNull();

    // Mobile: no overflow, no serious accessibility violations, and keyboard reaches every step.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('showcase-judge-card')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await page.getByTestId('judge-step-creators').focus();
    await expect(page.getByTestId('judge-step-creators')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/studio\/creators$/);

    // Reset leaves the judge card alone: it is a per-browser preference, not workspace state.
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/showcase');
    await page.getByTestId('showcase-reset-demo').click();
    await expect(page.getByText(/Reset: removed \d+ demo workspace\(s\)/)).toBeVisible();
    await expect(page.getByTestId('showcase-judge-card')).toBeVisible();
  });
});
