import { expect, test, type Page } from '@playwright/test';

async function loadExample(page: Page) {
  await page.goto('/studio?demo=1');
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Exit walkthrough' }).click();
}

async function openExampleProject(page: Page) {
  await page.getByRole('link', { name: 'Build a landing snippet the lesson way' }).click();
  await expect(page.getByRole('heading', { name: 'Build a landing snippet the lesson way' })).toBeVisible();
}

test.describe('T11 Studio copy surfaces', () => {
  test('crew and connections explain the first run in plain language', async ({ page }) => {
    await loadExample(page);

    await page.goto('/studio/crew');
    const crewIntroduction = page.locator('main header').getByText(/Profiles describe each agent/);
    await expect(crewIntroduction).toContainText(
      'An agent shows as working only while it is connected and carrying out a task.',
    );
    await expect(crewIntroduction).not.toContainText(/WebMCP|auto-assigned|execution host/i);
    await expect(
      page.locator('main .sticker-blue, main .sticker-lavender, main .card-wash-lavender'),
    ).toHaveCount(0);

    await page.goto('/studio/settings/connections');
    const agentConnection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Agent connection' }),
    });
    await expect(agentConnection).toContainText('No agent connected');
    await expect(agentConnection).toContainText('compatible agent browser');
    await expect(agentConnection).not.toContainText(/WebMCP host|WebMCP-compatible/i);

    const privacy = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Privacy' }),
    });
    await expect(privacy).toContainText("All data for this space stays in this browser's storage.");
    await expect(privacy).not.toContainText(/IndexedDB|workspace/i);

    const commandLine = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Connect Codex CLI' }),
    });
    await expect(commandLine).toContainText('Export your space');
    await expect(commandLine).toContainText('compatible command-line agent');
    await expect(commandLine.locator('p').first()).not.toContainText(/MCP-capable|workspace/i);

    const dangerZone = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Danger zone' }),
    });
    await expect(dangerZone.getByRole('button', { name: /Delete space/ })).toBeVisible();

    const pairingField = page.locator('label.field').filter({ hasText: 'Pairing code' });
    await expect(pairingField.getByLabel('Pairing code')).toBeVisible();
  });

  test('project, proof, and work thread empty states return to the one required first step', async ({ page }) => {
    await page.goto('/studio/missions/new');
    await expect(page.getByText('Create a space first, then return here to define a project.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a space' })).toHaveAttribute('href', '/studio');

    await page.goto('/studio/proof');
    await expect(page.getByText('Create a space first, then Cherry can record proof for its work.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a space' })).toHaveAttribute('href', '/studio');

    await page.goto('/studio/work/missing');
    await expect(page.getByText('Create a space first.', { exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/workspace/i);
  });

  test('watch returns to the project and states its evidence limit as a sentence', async ({ page }) => {
    await loadExample(page);
    await openExampleProject(page);
    await page.getByRole('link', { name: 'Open source' }).click();

    await expect(page.getByRole('link', { name: 'Back to project' })).toBeVisible();
    const limitation = page.getByRole('note');
    await expect(limitation).toHaveText(
      'Cherry does not see or understand video frames. It uses transcripts and observations you enter. YouTube content plays only in the embedded player.',
    );
    await expect(limitation).not.toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByText(/^(YouTube|Manual) source$/)).toBeVisible();
    await expect(page.getByText(/^(YouTube|Manual) lesson$/)).toHaveCount(0);
    await expect(
      page.locator('main .sticker-blue, main .sticker-lavender, main .sticker-violet, main .sticker-sunburst, main .card-wash-lavender'),
    ).toHaveCount(0);
  });

  test('file space uses project language and names a human edit as yours', async ({ page }) => {
    await loadExample(page);
    await openExampleProject(page);
    await page.getByRole('link', { name: 'Open files' }).click();

    const subtitle = page.getByText(/Real files your project produces/);
    await expect(subtitle).toBeVisible();
    await expect(subtitle).not.toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByRole('link', { name: 'Back to project' })).toBeVisible();
    const filePathField = page.locator('label.field').filter({ hasText: 'File path' });
    await expect(filePathField.getByLabel('File path')).toBeVisible();
    await expect(page.getByText(/sha256 .* by you/)).toBeVisible();

    const previewLimit = page.getByText('Static · no scripts · no network · no access to Cherry data');
    await expect(previewLimit).not.toHaveCSS('text-transform', 'uppercase');
  });
});
