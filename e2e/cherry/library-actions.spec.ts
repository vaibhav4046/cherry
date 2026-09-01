import { expect, test } from '@playwright/test';

const rawLesson = [
  '0:05 Draft a release checklist from the approved evidence.',
  '0:40 Verify every claim before publishing the release.',
  '1:10 Save the checked method for the next release.',
].join('\n');

const secondLesson = [
  '0:05 Outline the launch brief from reviewed source notes.',
  '0:45 Check each promise against a captured source.',
  '1:20 Publish only the claims that passed review.',
].join('\n');

test.describe('Library workflow actions', () => {
  test('opens a prefilled disabled routine from an install-ready Library card', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(rawLesson);
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Approve this exact version' }).click();

    const ready = page.getByTestId('quick-ready');
    await expect(ready).toBeVisible();
    const routineHref = await ready.getByRole('link', { name: 'Use in a routine' }).getAttribute('href');
    expect(routineHref).toMatch(/\/studio\/routines\?workspaceId=.+&skillGraphId=.+/);
    await expect(ready.getByRole('link', { name: 'Send to an agent' })).toHaveAttribute('href', '/connect#host-codex');

    await ready.getByRole('link', { name: 'See it in your Library' }).click();
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    const skillName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
    expect(skillName).toBeTruthy();
    await expect(page.getByRole('link', { name: 'Use in a routine' })).toHaveAttribute('href', routineHref!);
    await expect(page.getByRole('link', { name: 'Send to an agent' })).toHaveAttribute('href', '/connect#host-codex');

    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(secondLesson);
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Approve this exact version' }).click();
    await expect(page.getByTestId('quick-ready')).toBeVisible();

    await page.goto('/studio/skills');
    const card = page.getByTestId('library-card').filter({ hasText: skillName! });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('install-ready');
    await expect(card.getByRole('link', { name: 'Send to an agent' })).toHaveAttribute('href', '/connect#host-codex');

    await card.getByRole('link', { name: 'Use in a routine' }).click();
    await expect(page).toHaveURL(/\/studio\/routines\?workspaceId=.+&skillGraphId=.+/);
    const form = page.getByTestId('routine-draft-form');
    await expect(form).toBeVisible();
    await expect(form.getByRole('heading', { name: 'Draft a routine' })).toBeFocused();
    await expect(form.getByRole('status')).toContainText(`Routine draft ready for ${skillName}`);
    await expect(form.locator('select[name="skillGraphId"] option:checked')).toContainText(skillName!);
    await expect(page.getByTestId('routine-row')).toHaveCount(0);

    await page.getByTestId('routine-draft-submit').click();
    const routine = page.getByTestId('routine-row').first();
    await expect(routine).toContainText(skillName!);
    await expect(routine).toContainText('disabled');
    await expect(form.getByRole('status')).toContainText('Routine draft created. It is disabled until you schedule and approve it.');
    await expect(form.getByRole('status')).not.toContainText('Nothing has been created yet.');

    const requestedSkillGraphId = new URL(routineHref!, 'http://cherry.local').searchParams.get('skillGraphId');
    expect(requestedSkillGraphId).toBeTruthy();
    const graphIds = await form.locator('select[name="skillGraphId"] option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    const otherSkillGraphId = graphIds.find((id) => id !== requestedSkillGraphId);
    expect(otherSkillGraphId).toBeTruthy();
    await form.locator('select[name="skillGraphId"]').selectOption(otherSkillGraphId!);
    await form.locator('select[name="skillGraphId"]').selectOption(requestedSkillGraphId!);
    await expect(form.getByRole('status')).toContainText('Routine draft created. It is disabled until you schedule and approve it.');
    await expect(form.getByRole('status')).not.toContainText('Nothing has been created yet.');

    await page.goto('/studio/skills');
    await page.getByTestId('library-card').filter({ hasText: skillName! }).getByRole('link', { name: 'Send to an agent' }).click();
    await expect(page).toHaveURL('/connect#host-codex');
    await expect(page.locator('#host-codex')).toBeInViewport();
  });

  test('switches to the skill workspace before prefilling and never drafts automatically', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(rawLesson);
    await page.getByRole('button', { name: 'Create a skill' }).click();
    await page.getByRole('button', { name: 'Approve this exact version' }).click();

    const routineHref = await page.getByTestId('quick-ready').getByRole('link', { name: 'Use in a routine' }).getAttribute('href');
    expect(routineHref).toBeTruthy();
    const requested = new URL(routineHref!, 'http://cherry.local');
    const originalWorkspaceId = requested.searchParams.get('workspaceId');
    const skillGraphId = requested.searchParams.get('skillGraphId');
    expect(originalWorkspaceId).toBeTruthy();
    expect(skillGraphId).toBeTruthy();

    await page.goto('/studio');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export workspace' }).click();
    const exportPath = await (await downloadPromise).path();
    expect(exportPath).toBeTruthy();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Import', { exact: true }).click();
    await (await fileChooserPromise).setFiles(exportPath!);
    await expect(page.getByText(/Imported "/)).toBeVisible();

    const workspace = page.getByLabel('Workspace');
    await expect(workspace).toBeVisible();
    const workspaceIds = await workspace.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    const otherWorkspaceId = workspaceIds.find((id) => id !== originalWorkspaceId);
    expect(otherWorkspaceId).toBeTruthy();
    await workspace.selectOption(otherWorkspaceId!);
    await expect(workspace).toHaveValue(otherWorkspaceId!);

    await page.goto('/studio/skills');
    const originalAction = page.locator(`a[href="${routineHref}"]`).filter({ hasText: 'Use in a routine' });
    await expect(originalAction).toHaveCount(1);
    await originalAction.click();

    await expect(page).toHaveURL(routineHref!);
    await expect(page.getByLabel('Workspace')).toHaveValue(originalWorkspaceId!);
    await expect(page.getByTestId('routine-draft-form').locator('select[name="skillGraphId"]')).toHaveValue(skillGraphId!);
    await expect(page.getByTestId('routine-row')).toHaveCount(0);
  });

  test('fails closed when a shared routine link points to unavailable local data', async ({ page }) => {
    await page.goto('/studio/routines?workspaceId=missing-workspace&skillGraphId=missing-skill');

    await expect(page.getByRole('alert')).toContainText('That skill is not available in this browser.');
    await expect(page.getByTestId('routine-draft-form')).toHaveCount(0);
    await expect(page.getByTestId('routine-row')).toHaveCount(0);
  });
});
