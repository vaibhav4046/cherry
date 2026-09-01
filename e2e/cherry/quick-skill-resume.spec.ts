import { expect, test } from '@playwright/test';

const transcript = [
  '0:05 Create a release checklist from the evidence.',
  '0:40 Check every claim before approval.',
  '1:10 Add the approved method to the library.',
].join('\n');

test.describe('Quick Skill recovery', () => {
  test('survives refresh and history navigation without restoring authority from local storage', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/studio/quick');

    const material = page.getByLabel('Paste a YouTube link, an article link, or raw text.');
    await material.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cherry.quickSkillDraft.v1'))).not.toBeNull();
    await page.reload();
    await expect(material).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    await page.getByTestId('quick-source-next').click();
    await expect(page).toHaveURL(/\/studio\/quick\?sourceId=[^&]+$/);
    const canonicalUrl = page.url();
    const canonicalSourceId = new URL(canonicalUrl).searchParams.get('sourceId')!;
    expect(canonicalUrl).not.toContain('youtube.com');

    await page.getByRole('button', { name: 'Paste transcript' }).click();
    await page.getByLabel('Transcript or captions').fill(transcript);
    await expect.poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('cherry.quickSkillDraft.v1'));
      return raw ? (JSON.parse(raw) as { transcriptText?: string }).transcriptText : null;
    }).toBe(transcript);

    await page.goto('/studio');
    await page.goBack();
    await expect(page).toHaveURL(canonicalUrl);
    await expect(page.getByLabel('Transcript or captions')).toHaveValue(transcript);
    await page.goForward();
    await page.goBack();
    await expect(page.getByLabel('Transcript or captions')).toHaveValue(transcript);

    await page.getByTestId('quick-transcript-next').click();
    const checkboxes = page.getByTestId('quick-steps').locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(3);
    await checkboxes.nth(1).uncheck();
    await expect.poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem('cherry.quickSkillDraft.v1'));
      return raw ? (JSON.parse(raw) as { kept?: { indices?: number[] } }).kept?.indices : null;
    }).toEqual([0, 2]);

    await page.reload();
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
    await expect(checkboxes.nth(2)).toBeChecked();

    await page.getByTestId('quick-generate').click();
    await expect(page.getByTestId('quick-ready')).toBeVisible({ timeout: 20_000 });
    await expect(page.evaluate(() => localStorage.getItem('cherry.quickSkillDraft.v1'))).resolves.toBeNull();
    await page.reload();
    await expect(page.getByTestId('quick-ready')).toBeVisible();
    await expect(page.getByText(/approved r\d+ by you/)).toBeVisible();

    await page.getByRole('button', { name: 'Teach another' }).click();
    await expect(page).toHaveURL(/\/studio\/quick$/);
    await expect(page.getByLabel('Paste a YouTube link, an article link, or raw text.')).toHaveValue('');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cherry.quickSkillDraft.v1'))).toBeNull();

    await page.evaluate(({ sourceId }) => {
      localStorage.setItem('cherry.quickSkillDraft.v1', JSON.stringify({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        workspaceId: localStorage.getItem('cherry.activeWorkspaceId'),
        sourceId,
        material: '',
        sourceChoice: 'paste',
        transcriptText: 'must not be restored for a different explicit source',
        transcriptSource: 'user_text',
        additionalSourceText: '',
        skillName: 'Stored valid source',
        kept: null,
      }));
    }, { sourceId: canonicalSourceId });
    await page.goto('/studio/quick?sourceId=src_missing');
    await expect(page.getByRole('alert')).toContainText('not available in your current space');
    await expect(page.getByTestId('quick-ready')).not.toBeVisible();
    await expect(page.getByLabel('Paste a YouTube link, an article link, or raw text.')).toHaveValue('');
  });
});
