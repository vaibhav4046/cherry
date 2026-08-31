import { expect, test } from '@playwright/test';

test.describe('Source Inbox', () => {
  test('saves user-selected note and article sources, survives reload, and reuses a lesson', async ({ page }) => {
    await page.goto('/studio/sources');
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    await page.getByRole('button', { name: /Note/ }).click();
    await page.getByLabel('Title').fill('A tiny review loop');
    await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Review the evidence before turning it into a skill.');
    await page.getByRole('button', { name: 'Save locally' }).click();
    await expect(page.getByTestId('source-card')).toContainText('A tiny review loop');
    await expect(page.getByTestId('source-card')).toContainText('Ready for skill');

    await page.getByRole('button', { name: 'Create skill' }).click();
    await expect(page).toHaveURL(/\/studio\/quick\?sourceId=/);
    await expect(page.getByRole('heading', { name: 'Quick Skill' })).toBeVisible();
    await expect(page.getByText('Review & approve')).toBeVisible();

    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    await page.getByRole('button', { name: /Article or post/ }).click();
    await page.getByLabel('Title').fill('Public article metadata');
    await page.getByLabel('URL (metadata only)').fill('https://example.com/article');
    await page.getByLabel('Body or permitted export (optional)').fill('A permitted article export with one useful paragraph.');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Save locally' }).click();
    await expect(page.getByTestId('source-card')).toHaveCount(2);

    await page.reload();
    await expect(page.getByTestId('source-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Ready for skill' }).click();
    await expect(page.getByRole('heading', { name: 'A tiny review loop' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Public article metadata' })).toBeVisible();
  });

  test('surfaces explicit fetch limits without starting a request', async ({ page }) => {
    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    await page.getByRole('button', { name: /Article or post/ }).click();
    await page.getByLabel('Title').fill('LinkedIn export');
    await page.getByLabel('URL (metadata only)').fill('https://www.linkedin.com/posts/example');
    await page.getByLabel('Body or permitted export (optional)').fill('Pasted export text.');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Save locally' }).click();
    await expect(page.getByTestId('source-card')).toContainText('LinkedIn export');
    await page.getByRole('button', { name: 'Fetch selected page' }).click();
    await expect(page.getByRole('alert')).toContainText('LinkedIn');
  });
});
