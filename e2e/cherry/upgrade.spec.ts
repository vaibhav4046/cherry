import { expect, test } from '@playwright/test';

test.describe('landing upgrade', () => {
  test('three CTAs are present and the cherry burst opens the Studio', async ({ page }) => {
    await page.goto('/');
    const ctas = page.getByTestId('hero-ctas');
    await expect(ctas.getByRole('link', { name: 'Try the guided example' })).toBeVisible();
    await expect(ctas.getByRole('link', { name: 'Teach Cherry from a video' })).toBeVisible();
    await expect(ctas.getByRole('link', { name: 'Open MCP Studio' })).toBeVisible();

    await page.getByTestId('cherry-burst').click();
    await expect(page).toHaveURL(/\/studio$/, { timeout: 10_000 });
  });

  test('cherry burst respects reduced motion (navigates immediately)', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('cherry-burst').click();
    await expect(page).toHaveURL(/\/studio$/, { timeout: 5_000 });
    await context.close();
  });

  test('compatibility page renders honest status labels', async ({ page }) => {
    await page.goto('/compatibility');
    await expect(page.getByRole('heading', { name: 'Compatibility & proof' })).toBeVisible();
    const rows = page.getByTestId('compat-rows');
    await expect(rows.getByText('Manual golden journey (no AI provider)')).toBeVisible();
    // The live-host row is honestly labelled Experimental, not Validated.
    const chatgptRow = rows.locator('.card', { hasText: 'ChatGPT / Codex in-app browser' });
    await expect(chatgptRow.getByText('Experimental')).toBeVisible();
    const authRow = rows.locator('.card', { hasText: 'Accounts / auth' });
    await expect(authRow.getByText('Roadmap')).toBeVisible();
  });
});

test.describe('guided example and walkthrough', () => {
  test('Try the guided example loads the real example workspace and starts the tour', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('hero-ctas').getByRole('link', { name: 'Try the guided example' }).click();

    // The example is a real import: mission list shows the example mission.
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Build a landing snippet the lesson way').first()).toBeVisible();

    // The tour is active on step 1.
    const tour = page.getByTestId('guided-tour');
    await expect(tour).toBeVisible();
    await expect(tour.getByText('Welcome to the workshop')).toBeVisible();

    // Step through: each Next navigates to a real populated route.
    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/missions\//);
    await expect(page.getByTestId('mission-state')).toHaveText('COMPLETE');

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/watch\//);

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/skills\//);
    await expect(page.getByTestId('skill-status')).toContainText('approved');

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/artifacts\//);

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/proof$/);
    await expect(page.getByTestId('receipt-status')).toContainText('verified');

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/agent$/);
    await expect(page.getByTestId('aperture-table')).toBeVisible();

    await tour.getByTestId('tour-next').click();
    await expect(page).toHaveURL(/\/studio\/skills$/);
    await tour.getByTestId('tour-finish').click();
    await expect(page.getByTestId('guided-tour')).toHaveCount(0);
  });

  test('walkthrough is replayable from the Command Center', async ({ page }) => {
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('guided-tour')).toBeVisible();
    // Exit, then replay.
    await page.getByRole('button', { name: 'Exit walkthrough' }).click();
    await expect(page.getByTestId('guided-tour')).toHaveCount(0);
    await page.getByTestId('replay-walkthrough').click();
    await expect(page.getByTestId('guided-tour')).toBeVisible();
  });
});

test.describe('agent view (MCP inspector)', () => {
  test('manual mode shows the honest aperture story with zero fake activity', async ({ page }) => {
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Exit walkthrough' }).click();
    await page.getByRole('link', { name: 'Agent', exact: true }).first().click();

    await expect(page.getByTestId('agent-mode')).toContainText('Manual mode');
    await expect(page.getByTestId('agent-phase')).toContainText('Verified — export ready');
    // Aperture table lists the passed-phase tools highlighted.
    const table = page.getByTestId('aperture-table');
    await expect(table.getByText('compile_skill_bundle')).toBeVisible();
    await expect(table.getByText('read_cherry_context')).toBeVisible();
    // No fake registrations or calls in manual mode.
    await expect(page.getByTestId('registered-empty')).toBeVisible();
    await expect(page.getByTestId('calls-empty')).toBeVisible();
  });

  test('teach CTA routes into the first-mission form once a workspace exists', async ({ page }) => {
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Exit walkthrough' }).click();
    await page.goto('/studio?teach=1');
    await expect(page).toHaveURL(/\/studio\/missions\/new$/);
    await expect(page.getByRole('heading', { name: 'New mission' })).toBeVisible();
  });
});

test.describe('upgrade accessibility', () => {
  test('compatibility page has no serious axe violations', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await page.goto('/compatibility');
    await expect(page.getByRole('heading', { name: 'Compatibility & proof' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('agent view has no serious axe violations and the tour card is a labelled dialog', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: 'Guided walkthrough' })).toBeVisible();
    await page.getByRole('button', { name: 'Exit walkthrough' }).click();
    await page.getByRole('link', { name: 'Agent', exact: true }).first().click();
    await expect(page.getByTestId('aperture-table')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
