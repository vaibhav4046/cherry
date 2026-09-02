import { expect, test } from '@playwright/test';

test.describe('workforce: crew, inbox, work thread', () => {
  test('starter crew → handoff → thread → legal transitions only', async ({ page }) => {
    test.setTimeout(120_000);

    // Workspace
    await page.goto('/studio');
    await page.getByLabel('Space name').fill('Workforce workspace');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();

    // Crew: five editable profiles, honest idle status
    await page.getByRole('link', { name: 'Crew', exact: true }).first().click();
    await page.getByTestId('create-starter-crew').click();
    await expect(page.getByTestId('agent-card')).toHaveCount(5);
    await expect(page.getByTestId('crew-grid').getByText('Lead', { exact: true })).toBeVisible();
    await expect(page.getByTestId('agent-card').first().getByText('idle')).toBeVisible();

    // Inbox: hand off a real objective
    await page.getByRole('link', { name: 'Inbox', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'What should your crew get done?' })).toBeVisible();
    await page.getByLabel('Objective title').fill('Refresh the pricing page');
    await page.getByLabel('Objective', { exact: true }).fill('Ship a refreshed pricing page the crew can verify.');
    await page.getByLabel('Definition of done (one item per line)').fill('page builds\ncontrast passes');
    await page.getByTestId('handoff-submit').click();
    await expect(page.getByTestId('work-item-row')).toHaveCount(1);
    await expect(page.getByTestId('work-item-row').getByText('DRAFT')).toBeVisible();

    // Thread: walk DRAFT → READY → QUEUED, then cancel; SUCCEEDED is never offered.
    await page.getByTestId('work-item-row').click();
    await expect(page.getByTestId('work-status')).toHaveText('DRAFT');
    await expect(page.getByTestId('work-actions').getByRole('button', { name: 'Mark ready' })).toBeVisible();
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /succeed/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Mark ready' }).click();
    await expect(page.getByTestId('work-status')).toHaveText('READY');
    await page.getByRole('button', { name: 'Queue it' }).click();
    await expect(page.getByTestId('work-status')).toHaveText('QUEUED');

    // Thread messages are real records.
    await page.getByLabel('Message').fill('Kick-off — crew assigned.');
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByTestId('work-messages').getByText('Kick-off — crew assigned.')).toBeVisible();
    await expect(page.getByTestId('work-messages').getByText('you · message', { exact: true })).toBeVisible();
    await expect(page.getByTestId('work-messages').getByText('human · message', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('work-status')).toHaveText('CANCELLED');
    // Terminal: the person sees the outcome and no further controls.
    await expect(page.getByTestId('work-actions')).toHaveCount(0);
    await expect(page.getByText('This task was cancelled. No further actions are available.')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/human moves/i);
  });

  test('routines page renders honestly with no routines yet', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Space name').fill('Routine smoke');
    await page.getByRole('button', { name: 'Create space' }).click();
    await page.getByRole('link', { name: 'Routines', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /Routines/i }).first()).toBeVisible();
    await expect(page.getByText(/approved local or cloud execution host|approved skill/i).first()).toBeVisible();
  });
});
