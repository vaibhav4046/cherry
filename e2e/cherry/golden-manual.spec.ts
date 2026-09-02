import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Release-blocking golden journey, executed entirely manually — no AI provider,
 * no WebMCP host. Exercises: workspace → mission → lesson → transcript →
 * observation → evidence → skillgraph → exact-revision approval → artifact →
 * fail → repair → pass → receipt → recompute → export → import → reload.
 */
test.describe('golden manual journey', () => {
  test('a fresh user completes the full loop with real persisted state', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');

    // Landing → Studio
    await expect(page.getByRole('heading', { name: /One task. An entire AI team./i })).toBeVisible();
    await page.getByRole('link', { name: 'Open Studio', exact: true }).first().click();

    // Empty state: create workspace
    await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
    await page.getByLabel('Space name').fill('Golden journey workspace');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();

    // Create project
    await page.getByRole('link', { name: 'Create project' }).first().click();
    await page.getByLabel('Title').fill('Learn the landing snippet');
    await page.getByLabel('Objective').fill('Build a small landing page snippet following the lesson principles');
    await page.getByLabel('Definition of done (one item per line)').fill('index.html exists with an h1\nVerification passes');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByTestId('mission-state')).toHaveText('DRAFT');

    // Load a manual lesson (offline-safe path; YouTube compliance is unit-tested)
    await page.getByLabel('Source title').fill('Semantic layout lesson');
    await page.getByRole('button', { name: 'Load source' }).click();
    await expect(page.getByTestId('mission-state')).toHaveText('LEARNING');
    await expect(page.locator('.run-result').filter({ hasText: /^you$/ }).first()).toBeVisible();

    // Open Cherry Watch
    await page.getByRole('link', { name: 'Open source' }).click();
    await expect(page.getByRole('heading', { name: 'Semantic layout lesson' })).toBeVisible();
    await expect(page.getByText('Manual source', { exact: true })).toBeVisible();
    await expect(page.getByText('Manual lesson', { exact: true })).toHaveCount(0);
    await expect(page.locator('main .card-wash-lavender')).toHaveCount(0);

    // Import a transcript by paste
    await page
      .getByLabel('Transcript text')
      .fill('[0:05] The presenter creates index.html\n\n[0:40] A main landmark wraps the content\n\n[1:20] The heading uses a real h1');
    await page.getByRole('button', { name: 'Import pasted text' }).click();
    await expect(page.getByRole('heading', { name: /Transcript \(3 segments\)/ })).toBeVisible();

    // Record an observation
    await page.locator('textarea[name="text"]').fill('Presenter wraps page content in a main landmark');
    await page.locator('select[name="kind"]').selectOption('visual');
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Observations \(1\)/ })).toBeVisible();

    // Coverage cannot be complete without criteria
    await expect(page.getByText('Incomplete')).toBeVisible();

    // Declare a criterion satisfied by the observation timestamp (0s)
    await page.getByLabel('Criterion').fill('Setup steps');
    await page.getByLabel('Start time (seconds)').fill('0');
    await page.getByLabel('End time (seconds)').fill('120');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Criteria complete')).toBeVisible();

    // Back to project → save source notes and draft the skill
    await page.getByRole('link', { name: 'Back to project' }).click();
    await page.getByLabel('Source note').fill('Semantic landmarks are transferable to any page');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Semantic landmarks are transferable to any page')).toBeVisible();
    await expect(page.locator('.data-table').getByText('Your note', { exact: true })).toBeVisible();
    await expect(page.locator('.data-table').getByText('user_statement', { exact: true })).toHaveCount(0);
    await expect(page.locator('.data-table').getByText('Needs review').first()).toBeVisible();

    // Review and approve the source as a person
    await page.getByRole('button', { name: 'Mark as reviewed' }).first().click();
    await expect(page.locator('.data-table').getByText('Reviewed').first()).toBeVisible();
    await page.getByRole('button', { name: 'Approve source' }).first().click();
    await expect(page.locator('.data-table').getByText('Approved').first()).toBeVisible();

    await page.getByRole('button', { name: 'Draft the skill' }).click();
    await expect(page.getByTestId('mission-state')).toHaveText('PLANNING');

    // Open the skill and edit one node (creates a new revision)
    const missionUrl = page.url();
    await page.getByRole('link', { name: 'Open skill' }).click();
    await expect(page.getByTestId('skill-status')).toContainText('draft');
    await page.getByRole('button', { name: /Produce the artifact/ }).click();
    await page.locator('form input[name="title"]').fill('Produce the landing artifact');
    await page.getByTestId('save-node').click();
    await expect(page.getByTestId('skill-status')).toContainText('r3');

    // Request approval and approve at the exact revision
    await page.getByRole('button', { name: 'Request approval', exact: true }).click();
    await page.getByTestId('approve-skill').click();
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    await expect(page.getByText(/approved r[0-9]+ by you/)).toBeVisible();

    // Back to the mission: move into execution and create artifacts
    await page.goto(missionUrl);
    await expect(page.getByTestId('mission-state')).toBeVisible();
    // PLANNING -> AWAITING_APPROVAL happened on request; approve moved nothing automatically.
    // Walk the state machine: AWAITING_APPROVAL -> EXECUTING
    const stateChip = page.getByTestId('mission-state');
    if ((await stateChip.textContent()) === 'PLANNING') {
      await page.getByRole('button', { name: 'Move to Awaiting approval' }).click();
    }
    await page.getByRole('button', { name: 'Move to Running' }).click();
    await expect(stateChip).toHaveText('EXECUTING');

    await page.getByRole('button', { name: 'Create files' }).click();
    await page.getByRole('link', { name: 'Open files' }).click();

    // Create a deliberately failing artifact (no h1)
    await page.getByLabel('File path').fill('index.html');
    await page.getByRole('button', { name: 'Create file' }).click();
    await page.getByTestId('artifact-editor').fill('<html lang="en"><head><title>Snippet</title></head><body><p>plain text only</p></body></html>');
    await page.getByTestId('save-artifact').click();
    await expect(page.getByText(/sha256/)).toBeVisible();

    // Back to the mission → run verification → expect an honest failure
    await page.getByRole('link', { name: 'Back to project' }).click();
    await page.getByTestId('run-verification').click();
    await expect(page.getByTestId('verification-status')).toContainText('failed');
    await expect(page.getByText('Failed assertions')).toBeVisible();
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);

    // Repair: fix the artifact, re-run, pass
    await page.getByRole('link', { name: 'Open files' }).click();
    await page.getByRole('button', { name: 'index.html', exact: true }).click();
    await page
      .getByTestId('artifact-editor')
      .fill('<html lang="en"><head><title>Snippet</title></head><body><main><h1>Landing snippet</h1></main></body></html>');
    await page.getByTestId('save-artifact').click();
    await page.getByRole('link', { name: 'Back to project' }).click();
    await page.getByTestId('run-verification').click();
    await expect(page.getByTestId('verification-status')).toContainText('passed');

    // Generate the proof receipt and recompute its hashes
    await page.getByRole('button', { name: 'Generate proof' }).click();
    await page.getByRole('link', { name: 'Proof', exact: true }).first().click();
    await expect(page.getByTestId('receipt-status')).toBeVisible();
    await page.getByTestId('recompute-receipt').click();
    await expect(page.getByTestId('recompute-result')).toContainText('Receipt verifies');

    // Approve a memory through the correction compiler
    await page.getByRole('link', { name: 'Memory', exact: true }).first().click();
    await page.locator('textarea[name="whatFailed"]').fill('First artifact had no h1');
    await page.locator('textarea[name="approvedFix"]').fill('Always include a real h1 heading');
    await page.getByRole('button', { name: 'Compile correction' }).click();
    await expect(page.getByTestId('memory-proposal')).toBeVisible();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByTestId('memory-proposal')).toHaveCount(0);

    // Routine reuse: the draft form offers only approved skills, binds the
    // exact revision, and stays disabled until a person approves manual use.
    await page.getByRole('link', { name: 'Routines', exact: true }).first().click();
    const routineForm = page.getByTestId('routine-draft-form');
    await expect(routineForm).toBeVisible();
    await expect(routineForm.locator('select[name="skillGraphId"] option').first()).toContainText('approved r');
    await page.getByTestId('routine-draft-submit').click();
    await page.getByTestId('routine-row').first().click();
    await expect(page.getByTestId('routine-enabled-sticker')).toContainText('disabled');
    await page.getByTestId('routine-approve').click();
    await expect(page.getByTestId('routine-enabled-sticker')).toContainText('enabled');

    // Skill Library: the approved skill is aggregated cross-workspace, marked
    // install-ready, and exports install files gated to the approved revision.
    await page.goto('/studio/skills');
    await expect(page.getByRole('heading', { name: 'Skill Library' })).toBeVisible();
    const libraryCard = page.getByTestId('library-card').first();
    await expect(libraryCard).toContainText('install-ready');
    await page.getByTestId('library-filter-approved').click();
    await expect(page.getByTestId('library-card')).toHaveCount(1);
    await libraryCard.getByTestId('library-card-open').click();
    await expect(page.getByTestId('export-skill-md')).toBeEnabled();
    await expect(page.getByTestId('copy-agents-md')).toBeEnabled();
    const skillMdDownload = page.waitForEvent('download');
    await page.getByTestId('export-skill-md').click();
    const skillMdFile = await skillMdDownload;
    expect(skillMdFile.suggestedFilename().endsWith('-SKILL.md')).toBe(true);

    // Export the workspace
    await page.getByRole('link', { name: 'Command', exact: true }).first().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export space' }).click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();
    const exportBuffer = await readFile(exportPath!);

    // Import it back (id-remapped copy appears)
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Import', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: exportBuffer,
    });
    await expect(page.getByText(/Imported "Golden journey workspace/)).toBeVisible();

    // Reload: state survives
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByText('Learn the landing snippet').first()).toBeVisible();
  });
});
