import { expect, test } from '@playwright/test';

const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const metadataUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;

test.describe('YouTube source polish', () => {
  test('fetches a title only on click and offers the transcript paths on the saved source', async ({ page }) => {
    const metadataRequests: string[] = [];
    await page.route('https://www.youtube.com/oembed?**', async (route) => {
      metadataRequests.push(route.request().url());
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ title: 'Evidence-led release workflow', author_name: 'Careful Creator' }),
      });
    });

    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    const url = page.getByLabel('URL (metadata only)');
    await url.fill(videoUrl);
    await url.press('Tab');
    expect(metadataRequests).toEqual([]);

    await page.getByRole('button', { name: 'Fetch title' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Evidence-led release workflow');
    expect(metadataRequests).toEqual([metadataUrl]);

    await page.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await page.getByRole('button', { name: 'Save locally' }).click();

    const source = page.getByTestId('source-card').filter({ hasText: 'Evidence-led release workflow' });
    await expect(source).toContainText('Needs transcript');
    await expect(source.getByRole('button', { name: 'Paste the transcript or captions' })).toBeVisible();
    await expect(source.getByRole('button', { name: 'Transcribe while I play it' })).toBeVisible();

    await source.getByRole('button', { name: 'Paste the transcript or captions' }).click();
    await expect(page).toHaveURL(/\/studio\/quick\?sourceId=.+&method=paste$/);
    await expect(page.getByLabel('Transcript or captions')).toBeVisible();
  });
});
