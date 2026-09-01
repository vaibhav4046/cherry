import { resolve } from 'node:path';
import { expect, test, type Request } from '@playwright/test';

const fixturePath = resolve(process.cwd(), 'tests/fixtures/watch-history.sample.json');

test.describe('Local YouTube watch-history import', () => {
  test('uses a modal keyboard path and restores focus on Escape', async ({ page }) => {
    await page.goto('/studio/sources');
    const trigger = page.getByRole('button', { name: 'Import YouTube history' });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Import your YouTube history' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => (node as HTMLDialogElement).matches(':modal'))).toBe(true);
    await expect(page.getByLabel('YouTube Takeout JSON')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('ranks a local Takeout file without network activity and saves only the chosen source', async ({ page }) => {
    await page.goto('/studio/sources');
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

    const networkRequests: string[] = [];
    const recordNetwork = (request: Request) => {
      if (['fetch', 'xhr', 'websocket'].includes(request.resourceType())) networkRequests.push(request.url());
    };
    page.on('request', recordNetwork);

    await page.getByRole('button', { name: 'Import YouTube history' }).click();
    await expect(page.getByRole('heading', { name: 'Import your YouTube history' })).toBeVisible();
    await expect(page.getByText('Nothing uploads anywhere.', { exact: true })).toBeVisible();
    await page.getByLabel('YouTube Takeout JSON').setInputFiles(fixturePath);

    const candidates = page.getByTestId('watch-history-candidate');
    await expect(candidates).toHaveCount(10);
    const studioNorth = candidates.filter({ has: page.getByRole('heading', { name: 'Studio North' }) });
    await expect(studioNorth).toContainText('4 videos from this channel in 90 days');
    await expect(page.getByText('8 usable entries · 2 skipped')).toBeVisible();
    await expect(page.getByText('Unselected Takeout details stay transient')).toHaveCount(0);
    await expect(page.getByTestId('source-card')).toHaveCount(0);

    const save = studioNorth.getByRole('button', { name: 'Save Studio North source' });
    await expect(save).toBeDisabled();
    await expect(page.getByText('Confirm permission before saving a source.')).toBeVisible();
    await page.getByRole('checkbox', { name: /I have permission to save source links I choose/ }).check();
    await save.click();

    const source = page.getByTestId('source-card').filter({ hasText: 'Practical lighting for small rooms' });
    await expect(source).toBeVisible();
    await expect(source).toContainText('Needs transcript');
    await expect(source).toContainText('From YouTube history');
    await expect(page.getByTestId('source-card')).toHaveCount(1);
    await expect(page.getByText('My skills', { exact: true })).toBeVisible();
    expect(networkRequests).toEqual([]);
    page.off('request', recordNetwork);

    await page.reload();
    await expect(page.getByTestId('source-card').filter({ hasText: 'Practical lighting for small rooms' })).toContainText('From YouTube history');
  });

  test('offers a deterministic pasted-URL fallback without inventing titles', async ({ page }) => {
    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Import YouTube history' }).click();
    await page.getByLabel('Or paste YouTube URLs').fill([
      'https://youtu.be/pastedVid02',
      'https://youtu.be/pastedVid01',
      'https://youtube.com.evil.example/watch?v=badhost0001',
    ].join('\n'));
    await page.getByRole('button', { name: 'Review URLs' }).click();

    const candidates = page.getByTestId('watch-history-candidate');
    await expect(candidates).toHaveCount(2);
    await expect(candidates.first()).toContainText('From the URL list you pasted.');
    await expect(candidates.first().getByRole('heading')).toHaveText('YouTube video pastedVid01');
    await expect(page.getByText('2 usable entries · 1 skipped')).toBeVisible();

    await page.getByRole('button', { name: 'Close YouTube history import' }).click();
    await page.getByRole('button', { name: 'Import YouTube history' }).click();
    await expect(page.getByLabel('Or paste YouTube URLs')).toHaveValue('');
  });
});
