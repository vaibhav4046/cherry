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

    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(rawLesson);
    await click(page.getByRole('button', { name: 'Create a skill' }));

    await expect(page.getByRole('heading', { name: 'Review the method' })).toBeVisible();
    await click(page.getByRole('button', { name: 'Approve this exact version' }));
    await expect(page.getByTestId('quick-ready')).toBeVisible();

    await click(page.getByRole('link', { name: 'See it in your Library' }));
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    expect(clicksAfterPaste).toBeLessThanOrEqual(5);
  });

  test('uses the official YouTube player and a user-supplied transcript', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Create a skill' }).click();

    await expect(page.getByTitle(/YouTube player/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Paste the transcript or captions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcribe while I play it' })).toBeVisible();

    await page.getByRole('button', { name: 'Paste the transcript or captions' }).click();
    await page.getByLabel('Transcript or captions').fill(rawLesson);
    await page.getByRole('button', { name: 'Review the method' }).click();
    await expect(page.getByRole('heading', { name: 'Review the method' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve this exact version' }).click();
    await expect(page.getByTestId('quick-ready')).toBeVisible();
  });
});
