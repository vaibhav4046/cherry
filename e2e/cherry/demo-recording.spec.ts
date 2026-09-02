import { expect, type Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const BEAT_MS = 500;

async function beat(page: Page, multiplier = 1) {
  await page.waitForTimeout(BEAT_MS * multiplier);
}

test.use({
  viewport: { width: 1280, height: 720 },
  video: {
    mode: 'on',
    size: { width: 1280, height: 720 },
  },
});

/**
 * The same persisted golden journey as the release-blocking manual e2e, paced
 * so a viewer can follow each product boundary in the uncut browser recording.
 * This spec is opt-in through `npm run record:demo` and is ignored by the
 * default Playwright configuration.
 */
test('records the complete golden loop without cuts', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /One task. An entire AI team./i })).toBeVisible();
  await beat(page, 2);

  await page.getByRole('link', { name: 'Open Studio', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
  await beat(page);

  await page.getByLabel('Space name').fill('Golden journey workspace');
  await beat(page);
  await page.getByRole('button', { name: 'Create space' }).click();
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  await beat(page);

  await page.getByRole('link', { name: 'Create project' }).first().click();
  await page.getByLabel('Title').fill('Learn the landing snippet');
  await page
    .getByLabel('Objective')
    .fill('Build a small landing page snippet following the lesson principles');
  await page
    .getByLabel('Definition of done (one item per line)')
    .fill('index.html exists with an h1\nVerification passes');
  await beat(page);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('mission-state')).toHaveText('DRAFT');
  await beat(page);

  await page.getByLabel('Source title').fill('Semantic layout lesson');
  await beat(page);
  await page.getByRole('button', { name: 'Load source' }).click();
  await expect(page.getByTestId('mission-state')).toHaveText('LEARNING');
  await beat(page);

  await page.getByRole('link', { name: 'Open source' }).click();
  await expect(page.getByRole('heading', { name: 'Semantic layout lesson' })).toBeVisible();
  await beat(page);

  await page
    .locator('textarea[name="transcript"]')
    .fill(
      '[0:05] The presenter creates index.html\n\n[0:40] A main landmark wraps the content\n\n[1:20] The heading uses a real h1',
    );
  await beat(page);
  await page.getByRole('button', { name: 'Import pasted text' }).click();
  await expect(page.getByRole('heading', { name: /Transcript \(3 segments\)/ })).toBeVisible();
  await beat(page);

  await page.locator('textarea[name="text"]').fill('Presenter wraps page content in a main landmark');
  await page.locator('select[name="kind"]').selectOption('visual');
  await beat(page);
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Observations \(1\)/ })).toBeVisible();
  await expect(page.getByText('Incomplete')).toBeVisible();
  await beat(page);

  await page.locator('input[name="label"]').fill('Setup steps');
  await page.locator('input[name="start"]').fill('0');
  await page.locator('input[name="end"]').fill('120');
  await beat(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Criteria complete')).toBeVisible();
  await beat(page);

  await page.getByRole('link', { name: 'Back to project' }).click();
  await page
    .getByPlaceholder('Record a claim or learned principle')
    .fill('Semantic landmarks are transferable to any page');
  await beat(page);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Semantic landmarks are transferable to any page')).toBeVisible();
  await expect(page.locator('.data-table').getByText('Needs review').first()).toBeVisible();
  await beat(page);

  await page.getByRole('button', { name: 'Mark as reviewed' }).first().click();
  await expect(page.locator('.data-table').getByText('Reviewed').first()).toBeVisible();
  await beat(page);
  await page.getByRole('button', { name: 'Approve source' }).first().click();
  await expect(page.locator('.data-table').getByText('Approved').first()).toBeVisible();
  await beat(page);

  await page.getByRole('button', { name: 'Draft the skill' }).click();
  await expect(page.getByTestId('mission-state')).toHaveText('PLANNING');
  await beat(page);

  const missionUrl = page.url();
  await page.getByRole('link', { name: 'Open skill' }).click();
  await expect(page.getByTestId('skill-status')).toContainText('draft');
  await beat(page);

  await page.getByRole('button', { name: /Produce the artifact/ }).click();
  await page.locator('form input[name="title"]').fill('Produce the landing artifact');
  await beat(page);
  await page.getByTestId('save-node').click();
  await expect(page.getByTestId('skill-status')).toContainText('r3');
  await beat(page);

  await page.getByRole('button', { name: 'Request approval', exact: true }).click();
  await beat(page);
  await page.getByTestId('approve-skill').click();
  await expect(page.getByTestId('skill-status')).toContainText('approved');
  await expect(page.getByText(/approved r[0-9]+ by you/)).toBeVisible();
  await beat(page, 2);

  await page.goto(missionUrl);
  const stateChip = page.getByTestId('mission-state');
  await expect(stateChip).toBeVisible();
  if ((await stateChip.textContent()) === 'PLANNING') {
    await page.getByRole('button', { name: 'Move to Awaiting approval' }).click();
    await beat(page);
  }
  await page.getByRole('button', { name: 'Move to Running' }).click();
  await expect(stateChip).toHaveText('EXECUTING');
  await beat(page);

  await page.getByRole('button', { name: 'Create files' }).click();
  await page.getByRole('link', { name: 'Open files' }).click();
  await beat(page);

  await page.locator('input[name="path"]').fill('index.html');
  await page.getByRole('button', { name: 'Create file' }).click();
  await page
    .getByTestId('artifact-editor')
    .fill(
      '<html lang="en"><head><title>Snippet</title></head><body><p>plain text only</p></body></html>',
    );
  await beat(page);
  await page.getByTestId('save-artifact').click();
  await expect(page.getByText(/sha256/)).toBeVisible();
  await beat(page);

  await page.getByRole('link', { name: 'Back to project' }).click();
  await page.getByTestId('run-verification').click();
  await expect(page.getByTestId('verification-status')).toContainText('failed');
  await expect(page.getByText('Failed assertions')).toBeVisible();
  await beat(page, 2);

  await page.getByRole('link', { name: 'Open files' }).click();
  await page.getByRole('button', { name: 'index.html', exact: true }).click();
  await page
    .getByTestId('artifact-editor')
    .fill(
      '<html lang="en"><head><title>Snippet</title></head><body><main><h1>Landing snippet</h1></main></body></html>',
    );
  await beat(page);
  await page.getByTestId('save-artifact').click();
  await page.getByRole('link', { name: 'Back to project' }).click();
  await page.getByTestId('run-verification').click();
  await expect(page.getByTestId('verification-status')).toContainText('passed');
  await beat(page, 2);

  await page.getByRole('button', { name: 'Generate proof' }).click();
  await page.getByRole('link', { name: 'Proof', exact: true }).first().click();
  await expect(page.getByTestId('receipt-status')).toBeVisible();
  await beat(page);
  await page.getByTestId('recompute-receipt').click();
  await expect(page.getByTestId('recompute-result')).toContainText('Receipt verifies');
  await beat(page, 2);

  await page.getByRole('link', { name: 'Memory', exact: true }).first().click();
  await page.locator('textarea[name="whatFailed"]').fill('First artifact had no h1');
  await page.locator('textarea[name="approvedFix"]').fill('Always include a real h1 heading');
  await beat(page);
  await page.getByRole('button', { name: 'Compile correction' }).click();
  await expect(page.getByTestId('memory-proposal')).toBeVisible();
  await beat(page);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('memory-proposal')).toHaveCount(0);
  await beat(page);

  await page.getByRole('link', { name: 'Routines', exact: true }).first().click();
  const routineForm = page.getByTestId('routine-draft-form');
  await expect(routineForm).toBeVisible();
  await expect(routineForm.locator('select[name="skillGraphId"] option').first()).toContainText(
    'approved r',
  );
  await beat(page);
  await page.getByTestId('routine-draft-submit').click();
  await page.getByTestId('routine-row').first().click();
  await expect(page.getByTestId('routine-enabled-sticker')).toContainText('disabled');
  await beat(page);
  await page.getByTestId('routine-approve').click();
  await expect(page.getByTestId('routine-enabled-sticker')).toContainText('enabled');
  await beat(page, 2);

  await page.goto('/studio/skills');
  await expect(page.getByRole('heading', { name: 'Skill Library' })).toBeVisible();
  const libraryCard = page.getByTestId('library-card').first();
  await expect(libraryCard).toContainText('install-ready');
  await page.getByTestId('library-filter-approved').click();
  await expect(page.getByTestId('library-card')).toHaveCount(1);
  await beat(page);
  await libraryCard.getByTestId('library-card-open').click();
  await expect(page.getByTestId('export-skill-md')).toBeEnabled();
  await expect(page.getByTestId('copy-agents-md')).toBeEnabled();
  await beat(page);

  const skillMdDownload = page.waitForEvent('download');
  await page.getByTestId('export-skill-md').click();
  const skillMdFile = await skillMdDownload;
  expect(skillMdFile.suggestedFilename().endsWith('-SKILL.md')).toBe(true);
  await beat(page);

  await page.getByRole('link', { name: 'Command', exact: true }).first().click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export space' }).click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();
  const exportBuffer = await readFile(exportPath!);
  await beat(page);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Import', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: exportBuffer,
  });
  await expect(page.getByText(/Imported "Golden journey workspace/)).toBeVisible();
  await beat(page, 2);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  await expect(page.getByText('Learn the landing snippet').first()).toBeVisible();
  await beat(page, 3);
});
