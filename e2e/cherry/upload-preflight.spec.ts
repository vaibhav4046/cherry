import { expect, test, type Page } from '@playwright/test';

async function openTranscriptUpload(page: Page) {
  await page.goto('/studio/quick');
  await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Create a skill' }).click();
  await page.getByRole('button', { name: 'Paste transcript' }).click();
}

test.describe('upload preflight boundaries', () => {
  test('rejects an empty transcript before entering the notebook', async ({ page }) => {
    await openTranscriptUpload(page);

    await page.getByTestId('quick-files').setInputFiles({
      name: 'retry.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(0),
    });

    await expect(page.getByRole('alert')).toHaveText('Some files were not added. retry.txt: That file is empty. Choose a text file with content.');
    await expect(page.getByTestId('notebook')).toHaveCount(0);

    await page.getByTestId('quick-files').setInputFiles({
      name: 'retry.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('0:05 Open the project\n0:10 Save the exact result'),
    });
    await expect(page.getByTestId('notebook')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('keeps mixed-batch failures visible after importing valid files', async ({ page }) => {
    await openTranscriptUpload(page);

    const uploadButton = page.getByRole('button', { name: 'Upload files' });
    await page.getByTestId('quick-transcript').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(uploadButton).toBeFocused();
    expect(await uploadButton.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');

    await page.getByTestId('quick-files').setInputFiles([
      { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
      { name: 'method.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00.000 --> 00:05.000\nOpen the project') },
    ]);

    await expect(page.getByTestId('notebook')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('empty.txt');
    await expect(page.getByRole('alert')).toContainText('That file is empty');
  });

  test('rejects unsupported and empty workspace files without importing a space', async ({ page }) => {
    await page.goto('/studio');
    await page.getByText('Already use Cherry?').click();
    const picker = page.locator('input[type="file"][accept*=".json"]').first();

    await picker.setInputFiles({
      name: 'workspace.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('{}'),
    });
    await expect(page.getByRole('alert')).toHaveText('Choose a Cherry .json export.');

    await picker.setInputFiles({
      name: 'workspace.json',
      mimeType: 'application/json',
      buffer: Buffer.from([0xff]),
    });
    await expect(page.getByRole('alert')).toHaveText('That Cherry export is not valid UTF-8 JSON. Export it again and retry.');

    await picker.setInputFiles({
      name: 'workspace.json',
      mimeType: 'application/json',
      buffer: Buffer.alloc(0),
    });
    await expect(page.getByRole('alert')).toHaveText('That Cherry export is empty. Choose another file.');
    await expect(page.getByText(/Imported "/)).toHaveCount(0);
    await expect(page.getByLabel('Space name')).toBeVisible();
  });
});
