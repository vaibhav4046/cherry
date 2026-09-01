import { expect, test } from '@playwright/test';

test('proof detail presents stored technical records in plain human-facing labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/studio?demo=1');
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Exit walkthrough' }).click();
  await page.goto('/studio/proof');

  await expect(page.getByTestId('receipt-status')).toContainText('verified');
  await expect(page.getByText('Skill is structurally valid')).toBeVisible();
  await expect(page.getByText('Swipe or scroll sideways to see source details.')).toBeVisible();
  const eventLedger = page.getByText(/^Event ledger \(/);
  await eventLedger.focus();
  await eventLedger.press('Enter');
  await expect(page.getByTestId('proof-actor').first()).toBeVisible();
  const actorLabels = await page.getByTestId('proof-actor').allTextContents();
  expect(actorLabels.length).toBeGreaterThan(0);
  expect(actorLabels.every((label) => ['you', 'your agent', 'Cherry', 'local runner', 'provider'].includes(label))).toBe(true);
  const eventRows = await page.locator('.event-row').allTextContents();
  expect(eventRows.join('\n')).not.toMatch(/\b(?:Mission|Workspace|SkillGraph)\b|\bby human\b/);

  const receiptHeading = page.getByRole('heading', { name: /^rc-/ });
  await expect(receiptHeading).toBeVisible();
  expect(await receiptHeading.evaluate((node) => {
    const card = node.closest('.card');
    if (!card) return false;
    const headingBounds = node.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    return headingBounds.left >= cardBounds.left && headingBounds.right <= cardBounds.right;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
