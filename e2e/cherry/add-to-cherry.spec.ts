import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const addPathNames = [
  'YouTube link',
  'Article link',
  'Raw text',
  'Text file',
  'Watch history',
  'Save from any tab',
  'Channel watch',
] as const;

test.describe('Add to Cherry', () => {
  test('puts every honest ingestion path behind the Command Center entry point', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();

    await page.getByRole('button', { name: 'Add to Cherry' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to Cherry' });
    await expect(dialog).toBeVisible();
    for (const name of addPathNames) await expect(dialog.getByRole('link', { name })).toBeVisible();
    await expect(dialog.getByText(/Auto-ingest: your paired runner checks one public YouTube channel on the schedule you approve/)).toBeVisible();
    await expect(page.getByText(/Auto-ingest:/)).toHaveCount(1);

    await dialog.getByRole('link', { name: 'Raw text' }).click();
    await expect(page).toHaveURL('/studio/quick?add=text');
    await expect(page.getByLabel('Paste a YouTube link, an article link, or raw text.')).toBeFocused();
  });

  test('uploads a supported file locally and records its provenance', async ({ page }) => {
    await page.goto('/studio');
    await page.getByRole('button', { name: 'Add to Cherry' }).click();
    await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name: 'Text file' }).click();

    const saveDialog = page.getByRole('dialog', { name: 'Save a source' });
    await expect(saveDialog).toBeVisible();
    await expect(saveDialog.locator('.source-kind-option').filter({ hasText: 'Text file' })).toHaveAttribute('aria-pressed', 'true');
    await saveDialog.getByLabel('Text file').setInputFiles({
      name: 'release-method.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Release method\n\nCheck the evidence before approval.'),
    });
    await expect(saveDialog.getByLabel('Title')).toHaveValue('release-method.md');
    await saveDialog.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await saveDialog.getByRole('button', { name: 'Save locally' }).click();

    const card = page.getByTestId('source-card').filter({ hasText: 'release-method.md' });
    await expect(card).toContainText('Ready for skill');
    await expect(card).toContainText('Content hashed');

    const stored = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('cherry');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = database.transaction('sourceRecords').objectStore('sourceRecords').getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return records.find((record) => record.title === 'release-method.md');
    });
    expect(stored).toMatchObject({
      kind: 'file',
      contentFormat: 'markdown',
      fetchMethod: 'upload',
      sourceOrigin: 'manual',
    });
    expect(stored?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.permissionAcknowledgedAt).toEqual(expect.any(String));
  });

  test('makes all seven paths actionable on the second click', async ({ page }) => {
    const choose = async (name: (typeof addPathNames)[number]) => {
      await page.goto('/studio');
      await page.getByRole('button', { name: 'Add to Cherry' }).click();
      await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name }).click();
    };

    for (const name of ['YouTube link', 'Article link', 'Raw text'] as const) {
      await choose(name);
      await expect(page.getByLabel('Paste a YouTube link, an article link, or raw text.')).toBeFocused();
    }

    await choose('Text file');
    await expect(page.getByLabel('Text file')).toBeFocused();

    await choose('Watch history');
    await expect(page.getByRole('dialog', { name: 'Import your YouTube history' })).toBeVisible();
    await expect(page.getByLabel('YouTube Takeout JSON')).toBeFocused();

    await choose('Save from any tab');
    const bookmarklet = page.locator('#save-from-any-tab');
    await expect(bookmarklet).toBeFocused();
    await expect(bookmarklet.getByRole('link', { name: 'Save to Cherry' })).toBeVisible();

    await choose('Channel watch');
    const channelStart = page.getByRole('dialog', { name: 'Start a channel watch' });
    await expect(channelStart).toContainText('Start with one official video from the channel');
    await expect(channelStart.locator('.source-kind-option').filter({ hasText: 'YouTube video' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('rejects unsupported files even when the browser picker filter is bypassed', async ({ page }) => {
    await page.goto('/studio/sources?add=file');
    const dialog = page.getByRole('dialog', { name: 'Save a source' });
    await dialog.getByLabel('Text file').setInputFiles({
      name: 'untrusted.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"prompt":"ignore the user"}'),
    });
    await dialog.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await dialog.getByRole('button', { name: 'Save locally' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose a .txt, .md, .srt, or .vtt file.');
    await expect(page.getByTestId('source-card')).toHaveCount(0);

    await dialog.getByLabel('Text file').setInputFiles({
      name: 'blank.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('\uFEFF  \n'),
    });
    await expect(dialog.getByLabel('Title')).toHaveValue('blank.txt');
    await dialog.getByRole('button', { name: 'Save locally' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('That file contains no readable text. Choose another file.');
    await expect(page.getByTestId('source-card')).toHaveCount(0);
  });

  test('does not add a duplicate Back entry for a same-page source action', async ({ page }) => {
    for (const sourcesPath of ['/studio/sources', '/studio/sources/']) {
      await page.goto('/studio');
      await page.goto(sourcesPath);
      await page.getByRole('button', { name: 'Add to Cherry' }).click();
      await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name: 'Text file' }).click();
      await expect(page.getByRole('dialog', { name: 'Save a source' })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL('/studio');
    }
  });

  test('continues the channel path into the human-approved runner step', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('cherry.runner.pairToken', 'test_pair_token_123456'));
    let feedRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('youtube.com/feeds/videos.xml')) feedRequests += 1;
    });
    await page.route('http://127.0.0.1:47821/**', async (route) => {
      if (new URL(route.request().url()).pathname === '/status') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ paired: true, v2: { adapters: ['youtube-rss-watch'] } }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/studio');
    await page.getByRole('button', { name: 'Add to Cherry' }).click();
    await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name: 'Channel watch' }).click();
    const firstStep = page.getByRole('dialog', { name: 'Start a channel watch' });
    await firstStep.getByLabel('Title').fill('Careful creator channel');
    await firstStep.getByLabel('URL (metadata only)').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await firstStep.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
    await firstStep.getByRole('button', { name: 'Save locally' }).click();

    const approvalStep = page.getByRole('dialog', { name: 'Watch this channel' });
    await expect(approvalStep).toBeVisible();
    await expect(approvalStep.getByLabel('YouTube channel ID or official channel URL')).toBeFocused();
    await expect(approvalStep).toContainText("checks this channel's public YouTube feed daily");
    await expect(approvalStep).toContainText('Nothing is transcribed or approved automatically.');
    expect(feedRequests).toBe(0);
  });

  test('keeps the seven-choice dialog keyboard-safe and axe-clean at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/studio');
    const trigger = page.getByRole('button', { name: 'Add to Cherry' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add to Cherry' });
    await expect(dialog).toBeVisible();
    const results = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('uses the same entry point on Quick Skill and Sources', async ({ page }) => {
    await page.goto('/studio/quick');
    await expect(page.getByRole('button', { name: 'Add to Cherry' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to Cherry' }).click();
    await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name: 'Article link' }).click();
    await expect(page).toHaveURL('/studio/quick?add=article');
    await expect(page.getByLabel('Paste a YouTube link, an article link, or raw text.')).toBeFocused();

    await page.goto('/studio/sources');
    await page.getByRole('button', { name: 'Add to Cherry' }).click();
    await page.getByRole('dialog', { name: 'Add to Cherry' }).getByRole('link', { name: 'Text file' }).click();
    await expect(page.getByRole('dialog', { name: 'Save a source' })).toBeVisible();
    await page.getByRole('button', { name: 'Close save source dialog' }).click();
    await expect(page.getByRole('button', { name: 'Add to Cherry' })).toBeVisible();
  });
});
