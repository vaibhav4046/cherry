import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const TRANSCRIPT = `0:00 Open the long recording and mark the five strongest moments.
0:20 Write a one-line hook for each moment before you cut anything.
0:45 Export each clip as its own file and name it after the hook.
1:05 Check every clip plays without the context of the full video.`;

test.describe('Creators watch engine', () => {
  test('empty state, sample creator, transcript changes readiness, set aside persists, reset removes', async ({ page }) => {
    test.setTimeout(150_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      // The only tolerated console error is the loopback runner probe being refused when no runner is paired.
      const runnerProbe = message.location().url.includes(':47821');
      if (message.type() === 'error' && !runnerProbe) pageErrors.push(`${message.text()} @ ${message.location().url}`);
    });

    // No space yet: the page says so and points at Studio.
    await page.goto('/studio/creators');
    await expect(page.getByRole('heading', { name: 'What\'s new from the creators you follow' })).toBeVisible();
    await expect(page.getByText('No space is active.')).toBeVisible();

    // A fresh space with nothing followed: the honest empty state and one primary action.
    await page.goto('/showcase');
    await page.getByTestId('showcase-start-fresh').click();
    await expect(page.getByText(/Fresh workspace created/)).toBeVisible();
    await page.goto('/studio/creators');
    await expect(page.getByTestId('creators-empty')).toBeVisible();
    await expect(page.getByTestId('creators-empty')).toContainText('Cherry never downloads the video.');
    await expect(page.getByTestId('creators-follow')).toHaveAttribute('href', '/studio/sources?add=channel');
    await expect(page.getByTestId('creators-runner')).toContainText('Pair the local runner to check channels automatically.');

    // The labelled sample library carries one synthetic followed creator and two uploads.
    await page.goto('/showcase');
    await page.getByTestId('showcase-load-starter-library').click();
    await expect(page).toHaveURL(/\/studio\/skills$/);
    await page.goto('/studio/creators');
    await expect(page.getByTestId('creator-row')).toHaveCount(1);
    await expect(page.getByTestId('creator-row')).toContainText('Sample Creator (synthetic)');
    await expect(page.getByTestId('creator-row')).toContainText('SAMPLE DATA');
    await expect(page.getByTestId('creator-row')).toContainText('1 new upload');

    const needsTranscript = page.locator('[data-testid="proposal-row"][data-readiness="needs-transcript"]');
    const draftReady = page.locator('[data-testid="proposal-row"][data-readiness="draft-ready"]');
    const approved = page.locator('[data-testid="proposal-row"][data-readiness="approved"]');
    await expect(needsTranscript).toHaveCount(1);
    await expect(draftReady).toHaveCount(1);
    await expect(approved).toHaveCount(8);

    // Only the true actions for each state.
    await expect(needsTranscript.getByRole('link', { name: 'Add transcript' })).toBeVisible();
    await expect(needsTranscript.getByRole('link', { name: 'Transcribe on this device' })).toBeVisible();
    await expect(needsTranscript.getByRole('button', { name: 'Not useful' })).toBeVisible();
    await expect(needsTranscript.getByRole('link', { name: 'Draft the skill' })).toHaveCount(0);
    await expect(draftReady.getByRole('link', { name: 'Draft the skill' })).toBeVisible();
    await expect(draftReady.getByRole('link', { name: 'Add transcript' })).toHaveCount(0);
    await expect(approved.first().getByRole('link', { name: 'Open in library' })).toBeVisible();
    await expect(approved.first().getByRole('button', { name: 'Not useful' })).toHaveCount(0);
    await expect(needsTranscript).toContainText('Turn one long video into five short clips');

    // Command Center reflects the same facts.
    await page.goto('/studio');
    await expect(page.getByTestId('creators-card')).toContainText('1 followed · 2 proposals waiting for you.');

    // Add transcript: Quick Skill opens on this source, the paste lands, and the row becomes draft-ready.
    await page.goto('/studio/creators');
    await needsTranscript.getByRole('link', { name: 'Add transcript' }).click();
    await expect(page).toHaveURL(/\/studio\/quick\?sourceId=[^&]+&method=paste$/);
    await page.getByLabel('Transcript or captions').fill(TRANSCRIPT);
    await page.getByTestId('quick-transcript-next').click();
    await expect(page.getByTestId('quick-steps')).toBeVisible();
    await page.goto('/studio/creators');
    await expect(needsTranscript).toHaveCount(0);
    await expect(draftReady).toHaveCount(2);
    await expect(page.getByTestId('creators-proposals')).toContainText('Turn one long video into five short clips');

    // Sources shows the same proposal inline.
    await page.goto('/studio/sources');
    await expect(page.getByTestId('source-proposal').first()).toContainText('Cherry proposes:');

    // Not useful is a human decision that survives reload.
    await page.goto('/studio/creators');
    await draftReady.first().getByRole('button', { name: 'Not useful' }).click();
    await expect(page.getByText('1 set aside.')).toBeVisible();
    await expect(draftReady).toHaveCount(1);
    await page.reload();
    await expect(draftReady).toHaveCount(1);
    await expect(page.getByText('1 set aside.')).toBeVisible();

    // Mobile width: no horizontal overflow, no serious accessibility violations.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('creators-proposals')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1024 });

    // Reset demo removes the sample creator with the sample workspace and leaves the person's own space alone.
    await page.goto('/showcase');
    await page.getByTestId('showcase-reset-demo').click();
    await expect(page.getByText(/Reset: removed \d+ demo workspace\(s\)\. Your own workspaces were not touched\./)).toBeVisible();
    await page.goto('/studio/creators');
    await expect(page.getByRole('heading', { name: 'What\'s new from the creators you follow' })).toBeVisible();
    await expect(page.getByTestId('creator-row')).toHaveCount(0);
    await expect(page.getByTestId('proposal-row')).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });

  test('keyboard-only: Follow a creator reaches the channel-watch dialog', async ({ page }) => {
    await page.goto('/showcase');
    await page.getByTestId('showcase-start-fresh').click();
    await expect(page.getByText(/Fresh workspace created/)).toBeVisible();
    await page.goto('/studio/creators');
    await page.getByTestId('creators-follow').focus();
    await expect(page.getByTestId('creators-follow')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/studio\/sources\?add=channel$/);
    await expect(page.getByRole('heading', { name: 'Start a channel watch' })).toBeVisible();
  });
});
