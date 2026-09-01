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
    const dialog = page.getByRole('dialog', { name: 'Save a source' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Title')).toBeFocused();
    const url = page.getByLabel('URL (metadata only)');
    await url.fill(videoUrl);
    await url.press('Tab');
    expect(metadataRequests).toEqual([]);

    await page.getByRole('button', { name: 'Fetch title' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Evidence-led release workflow');
    await expect(dialog.getByRole('status')).toHaveText('Title fetched: Evidence-led release workflow');
    expect(metadataRequests).toEqual([metadataUrl]);

    await page.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await page.getByRole('button', { name: 'Save locally' }).click();

    const source = page.getByTestId('source-card').filter({ hasText: 'Evidence-led release workflow' });
    await expect(source).toContainText('Needs transcript');
    await expect(source.getByRole('button', { name: 'Paste transcript' })).toBeVisible();
    await expect(source.getByRole('button', { name: 'Transcribe locally' })).toBeVisible();

    await source.getByRole('button', { name: 'Paste transcript' }).click();
    await expect(page).toHaveURL(/\/studio\/quick\?sourceId=.+&method=paste$/);
    await expect(page.getByLabel('Transcript or captions')).toBeVisible();
  });

  test('does not apply a delayed title after the user edits the form', async ({ page }) => {
    let releaseResponse!: () => void;
    let markRequested!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
    const requested = new Promise<void>((resolve) => { markRequested = resolve; });
    await page.route('https://www.youtube.com/oembed?**', async (route) => {
      markRequested();
      await responseGate;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ title: 'Stale title from the first video' }),
      });
    });

    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    const title = page.getByLabel('Title');
    const url = page.getByLabel('URL (metadata only)');
    await title.fill('My title');
    await url.fill(videoUrl);
    await page.getByRole('button', { name: 'Fetch title' }).click();
    await requested;

    await url.fill('https://youtu.be/9bZkp7q19f0');
    await title.fill('My edited title');
    releaseResponse();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    await expect(url).toHaveValue('https://youtu.be/9bZkp7q19f0');
    await expect(title).toHaveValue('My edited title');
  });

  test('closes the modal with Escape and returns focus to its trigger', async ({ page }) => {
    await page.goto('/studio/sources');
    const trigger = page.getByRole('button', { name: 'Save a source' }).first();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Save a source' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('keeps a save failure visible and focused inside the modal', async ({ page }) => {
    await page.goto('/studio/sources');
    const trigger = page.getByRole('button', { name: 'Save a source' }).first();

    await trigger.click();
    await page.getByLabel('Title').fill('Duplicate source');
    await page.getByLabel('URL (metadata only)').fill(videoUrl);
    await page.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await page.getByRole('button', { name: 'Save locally' }).click();
    await expect(page.getByRole('dialog', { name: 'Save a source' })).not.toBeVisible();

    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Save a source' });
    await page.getByLabel('Title').fill('Duplicate source');
    await page.getByLabel('URL (metadata only)').fill(videoUrl);
    await page.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await page.getByRole('button', { name: 'Save locally' }).click();

    const error = dialog.getByRole('alert');
    await expect(dialog).toBeVisible();
    await expect(error).toHaveText('This source is already in your inbox. Choose another source.');
    await expect(error).toBeFocused();
  });
});
