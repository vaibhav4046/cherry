import { expect, test, type Page } from '@playwright/test';

const anchorVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const channelId = 'UCSTUDIONORTH12345678901';

async function saveYouTubeSource(page: Page, title: string) {
  await page.getByRole('button', { name: 'Save a source' }).first().click();
  const titleInput = page.getByRole('textbox', { name: 'Title', exact: true });
  const urlInput = page.getByRole('textbox', { name: 'URL (metadata only)', exact: true });
  await titleInput.fill(title);
  await expect(titleInput).toHaveValue(title);
  await urlInput.fill(anchorVideoUrl);
  await expect(urlInput).toHaveValue(anchorVideoUrl);
  await page.getByRole('checkbox', { name: /I have permission to use this material/ }).check();
  await page.getByRole('button', { name: 'Save locally' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  return page.getByTestId('source-card').filter({ hasText: title });
}

test.describe('public YouTube channel watches', () => {
  test('does nothing while unpaired and explains how to enable channel checks', async ({ page }) => {
    let runnerPosts = 0;
    let browserFeedRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('youtube.com/feeds/videos.xml')) browserFeedRequests += 1;
    });
    await page.route('http://127.0.0.1:47821/**', async (route) => {
      if (route.request().method() === 'POST') runnerPosts += 1;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ paired: false }) });
    });

    await page.goto('/studio/sources');
    const source = await saveYouTubeSource(page, 'Channel watch anchor');
    await expect(source.getByText('pair the local runner to check channels', { exact: true })).toBeVisible();
    await expect(source.getByRole('button', { name: /Watch .* channel/ })).toHaveCount(0);
    await expect(source.getByRole('button', { name: 'Check now' })).toHaveCount(0);
    expect(runnerPosts).toBe(0);
    expect(browserFeedRequests).toBe(0);
  });

  test('reconciles a paired runner result into one transcript-needed draft', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('cherry.runner.pairToken', 'test_pair_token_123456'));
    let sourceId = '';
    let actionHash = '';
    let revision = 0;
    let workspaceId = '';
    let browserFeedRequests = 0;
    let exposeCompletedJob = false;
    let checkCount = 0;
    const publishedAt = new Date(Date.now() + 60_000).toISOString();
    const checkedAt = new Date(Date.now() + 120_000).toISOString();
    page.on('request', (request) => {
      if (request.url().includes('youtube.com/feeds/videos.xml')) browserFeedRequests += 1;
    });
    await page.route('http://127.0.0.1:47821/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/status') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ paired: true, v2: { adapters: ['youtube-rss-watch'] } }) });
        return;
      }
      if (url.pathname === '/v2/channel-watches' && request.method() === 'POST') {
        const body = request.postDataJSON() as { sourceId: string; actionHash: string; revision: number; workspaceId: string };
        sourceId = body.sourceId;
        actionHash = body.actionHash;
        revision = body.revision;
        workspaceId = body.workspaceId;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ routineId: `rss-watch:${sourceId}`, actionHash }) });
        return;
      }
      if (url.pathname === `/v2/channel-watches/${sourceId}/check` && request.method() === 'POST') {
        exposeCompletedJob = true;
        checkCount += 1;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ jobId: `job-channel-${checkCount}` }) });
        return;
      }
      const stdout = JSON.stringify({
        schemaVersion: 1,
        watchId: sourceId,
        actionHash,
        channelId,
        checkedAt,
        channelName: 'Studio North',
        feedHash: 'b'.repeat(64),
        entries: [{
          videoId: 'freshVid001',
          title: 'A fresh evidence workflow',
          url: 'https://www.youtube.com/watch?v=freshVid001',
          publishedAt,
        }],
      });
      const completedJob = {
        id: 'job-channel-1',
        status: 'completed',
        createdAt: checkedAt,
        envelope: {
          workspaceId,
          workItemId: `rss-watch:${sourceId}`,
          workItemRevision: revision,
          adapter: 'youtube-rss-watch',
          boundedPrompt: JSON.stringify({ actionHash, channelId, sourceId, workspaceId }),
        },
        result: { status: 'completed', exitCode: 0, stdout, stderr: '' },
      };
      const failedJob = {
        id: 'job-channel-2',
        status: 'failed',
        createdAt: new Date(Date.parse(checkedAt) + 60_000).toISOString(),
        envelope: completedJob.envelope,
        result: { message: 'fixture failure' },
        lastError: 'fixture failure',
      };
      if (url.pathname === '/v2/jobs/job-channel-1') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ job: completedJob }) });
        return;
      }
      if (url.pathname === '/v2/jobs/job-channel-2') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ job: failedJob }) });
        return;
      }
      if (url.pathname === `/v2/channel-watches/${sourceId}/jobs`) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jobs: exposeCompletedJob ? [completedJob, ...(checkCount > 1 ? [failedJob] : [])] : [] }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
    });

    await page.goto('/studio/sources');
    const anchor = await saveYouTubeSource(page, 'Paired channel anchor');
    await anchor.getByRole('button', { name: 'Watch Paired channel anchor channel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Watch this channel' });
    await expect(dialog).toContainText("Your paired local runner checks this channel's public YouTube feed daily.");
    await expect(dialog).toContainText('Nothing is transcribed or approved automatically. Checks run only while your paired runner is on.');
    const channelField = dialog.getByLabel('YouTube channel ID or official channel URL');
    await expect(channelField).toBeFocused();
    await channelField.fill(channelId);
    await page.getByRole('button', { name: 'Save watch' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(anchor.getByTestId('channel-watch-state')).toBeFocused();
    await expect(anchor).toContainText('Never checked');

    await anchor.getByRole('button', { name: 'Check Paired channel anchor channel now' }).click();
    const draft = page.getByTestId('source-card').filter({ hasText: 'A fresh evidence workflow' });
    await expect(draft).toContainText('From channel watch');
    await expect(draft).toContainText('Needs transcript');
    await expect(draft.getByRole('button', { name: 'Paste transcript' })).toBeVisible();
    await expect(draft.getByRole('button', { name: 'Transcribe locally' })).toBeVisible();
    const expectedLastChecked = await page.evaluate((value) => new Date(value).toLocaleString(), checkedAt);
    await expect(anchor).toContainText(`Last checked ${expectedLastChecked}`);
    expect(browserFeedRequests).toBe(0);

    await anchor.getByRole('button', { name: 'Check Paired channel anchor channel now' }).click();
    await expect(page.getByRole('alert')).toContainText('The channel check failed and nothing was saved.');
    await expect(anchor).toContainText(`Last checked ${expectedLastChecked}`);

    await page.reload();
    await expect(page.getByTestId('source-card').filter({ hasText: 'A fresh evidence workflow' })).toHaveCount(1);
    expect(browserFeedRequests).toBe(0);
  });

  test('keeps a rejected daily registration recoverable before stopping and archiving', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('cherry.runner.pairToken', 'test_pair_token_123456'));
    let sourceId = '';
    let actionHash = '';
    let registrationAttempts = 0;
    let runnerRemovals = 0;

    await page.route('http://127.0.0.1:47821/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/status') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ paired: true, v2: { adapters: ['youtube-rss-watch'] } }) });
        return;
      }
      if (url.pathname === '/v2/channel-watches' && request.method() === 'POST') {
        const body = request.postDataJSON() as { sourceId: string; actionHash: string };
        sourceId = body.sourceId;
        actionHash = body.actionHash;
        registrationAttempts += 1;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            routineId: `rss-watch:${sourceId}`,
            actionHash: registrationAttempts === 1 ? '0'.repeat(64) : actionHash,
          }),
        });
        return;
      }
      if (url.pathname === `/v2/channel-watches/${sourceId}` && request.method() === 'DELETE') {
        runnerRemovals += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: true, routineId: `rss-watch:${sourceId}` }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
    });

    await page.goto('/studio/sources');
    const source = await saveYouTubeSource(page, 'Recovery channel anchor');
    await source.getByRole('button', { name: 'Watch Recovery channel anchor channel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Watch this channel' });
    await dialog.getByLabel('YouTube channel ID or official channel URL').fill(channelId);
    await dialog.getByRole('button', { name: 'Save watch' }).click();

    const watchState = source.getByTestId('channel-watch-state');
    await expect(watchState).toBeFocused();
    await expect(source).toContainText('Watch saved · daily check not confirmed');
    await expect(page.getByRole('alert')).toContainText('The runner did not confirm this daily check.');
    await source.getByRole('button', { name: 'Connect Recovery channel anchor daily channel check' }).click();
    await expect(source).toContainText('Channel watch · daily');

    await source.getByRole('button', { name: 'Stop watching Recovery channel anchor' }).click();
    await expect(source.getByRole('button', { name: 'Watch Recovery channel anchor channel' })).toBeVisible();
    expect(runnerRemovals).toBe(1);

    await source.getByRole('button', { name: 'Archive' }).click();
    await expect(source).toHaveCount(0);
  });
});
