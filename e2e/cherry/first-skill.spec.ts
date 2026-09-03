import { expect, test } from '@playwright/test';

const rawLesson = [
  '0:05 Create a review checklist for the release.',
  '0:40 Always check the evidence before approving a change.',
  '1:10 Add the approved method to the library.',
].join('\n');

test.describe('first skill', () => {
  test('turns pasted text into an install-ready library skill in five clicks', async ({ page }) => {
    let clicksAfterPaste = 0;
    const click = async (target: ReturnType<typeof page.getByRole>) => {
      clicksAfterPaste += 1;
      await target.click();
    };

    await page.goto('/');
    await page.getByLabel('Main navigation').getByRole('link', { name: 'Mission Control' }).click();
    await page.getByRole('link', { name: 'Quick skill' }).click();
    await expect(page).toHaveURL(/\/studio\/quick$/);
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(rawLesson);
    await expect(page.getByText('By continuing, you confirm you may use this material.')).toBeVisible();
    await click(page.getByRole('button', { name: 'Create a skill' }));

    await expect(page.getByRole('heading', { name: 'Review the method' })).toBeVisible();
    await click(page.getByRole('button', { name: 'Approve this version' }));
    await expect(page.getByTestId('quick-ready')).toBeVisible();
    await expect(page.getByTestId('quick-load-starter-library')).toBeVisible();

    await click(page.getByRole('link', { name: 'Open Library' }));
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    expect(clicksAfterPaste).toBeLessThanOrEqual(5);
  });

  test('uses the official YouTube player and a user-supplied transcript', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Main navigation').getByRole('link', { name: 'Mission Control' }).click();
    await page.getByRole('link', { name: 'Quick skill' }).click();
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Create a skill' }).click();

    await expect(page.getByTitle(/YouTube player/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paste transcript' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcribe locally' })).toBeVisible();

    await page.getByRole('button', { name: 'Paste transcript' }).click();
    await page.getByLabel('Transcript or captions').fill(rawLesson);
    await page.getByRole('button', { name: 'Review the method' }).click();
    await expect(page.getByRole('heading', { name: 'Review the method' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve this version' }).click();
    await expect(page.getByTestId('quick-ready')).toBeVisible();
  });

  test('keeps every file from an initial multi-file transcript upload', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Paste transcript' }).click();
    await page.getByTestId('quick-files').setInputFiles([
      { name: 'foundation.txt', mimeType: 'text/plain', buffer: Buffer.from('0:05 Create the upload foundation for the release.') },
      { name: 'verification.txt', mimeType: 'text/plain', buffer: Buffer.from('0:40 Check the upload foundation against evidence.') },
    ]);

    const notebook = page.getByTestId('notebook');
    await expect(notebook).toBeVisible();
    await expect(page.getByTestId('source-card')).toHaveCount(2);
    await expect(page.getByTestId('quick-steps')).toContainText('Create the upload foundation');
    await expect(page.getByTestId('quick-steps')).toContainText('Check the upload foundation');
    await expect(notebook.locator('button.btn-primary')).toHaveCount(1);

    const addSource = page.getByTestId('quick-add-source');
    await expect(addSource).not.toHaveClass(/btn-primary/);
    await addSource.click();
    await expect(page.getByTestId('quick-transcript-next')).not.toHaveClass(/btn-primary/);
    await expect(notebook.locator('button.btn-primary')).toHaveCount(1);
  });

  test('keeps local capture secondary to the transcript review action', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Transcribe locally' }).click();

    await expect(page.getByTestId('capture-tab-audio')).not.toHaveClass(/btn-primary/);
    await expect(page.locator('main button.btn-primary')).toHaveCount(1);
  });

  test('uses replace for the first successful file when an earlier batch file is malformed', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Paste transcript' }).click();
    await page.getByTestId('quick-files').setInputFiles([
      { name: 'broken.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\nnot a cue') },
      { name: 'valid.txt', mimeType: 'text/plain', buffer: Buffer.from('0:05 Create the first successful source method.') },
    ]);

    await expect(page.getByTestId('quick-steps')).toContainText('Create the first successful source method');
    await page.goto('/studio/sources');
    const source = page.getByTestId('source-card').filter({ hasText: 'YouTube video' });
    await expect(source).toContainText('Ready for skill');
    await expect(source).toContainText('Content hashed');
  });
});
