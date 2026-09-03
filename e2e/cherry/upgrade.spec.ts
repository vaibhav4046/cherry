import { expect, test } from '@playwright/test';

test.describe('landing upgrade', () => {
  test('hero leads to Mission Control and the recorded evidence cabinet', async ({ page }) => {
    await page.goto('/');
    const actions = page.getByTestId('hero-actions');
    await expect(actions.getByRole('link', { name: 'Open Mission Control' })).toHaveAttribute('href', '/studio/control');
    await expect(actions.getByRole('link', { name: 'Watch 90 seconds' })).toHaveAttribute('href', '/showcase#recorded-mission');
    await expect(page.getByLabel('Main navigation').getByRole('link', { name: 'Mission Control' })).toBeVisible();
    await expect(page.getByTestId('proof-cabinet').locator('[data-verified-demo]')).toHaveCount(4);
  });

  test('landing respects reduced motion and leaves the replay paused', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const player = page.getByRole('region', { name: 'Recorded real Codex run' });
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute('data-playing', 'false');
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
    const authRow = rows.locator('.card', { hasText: 'Accounts (Privy, opt-in)' });
    await expect(authRow.getByText('Shipped')).toBeVisible();
    const libraryRow = rows.locator('.card', { hasText: 'Skill Library + global library tools' });
    await expect(libraryRow.getByText('Validated')).toBeVisible();
    // The Creators engine is labelled by what is tested, and says what is not captured.
    const creatorsRow = rows.locator('.card', { hasText: 'Creators watch engine' });
    await expect(creatorsRow.getByText('Validated')).toBeVisible();
    await expect(creatorsRow).toContainText('never downloads a video or captions');
    await expect(creatorsRow).toContainText('was not captured');
  });
});

test.describe('guided example and walkthrough', () => {
  test('the guided demo route loads the real example workspace and starts the tour', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/studio?demo=1');

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
    await expect(page).toHaveURL(/\/studio\/skills(\?sample=loaded)?$/);
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
    await expect(page.getByTestId('agent-phase')).toContainText('Verified, export ready');
    await expect(page.getByRole('heading', { name: 'Agent brief, guided by you' })).toBeVisible();
    await expect(page.getByTestId('autopilot-card')).toContainText('Do not claim to watch or understand video frames.');
    await expect(page.getByTestId('autopilot-card')).not.toContainText(/browser vision|WATCH the embedded/i);
    await expect(page.getByTestId('autopilot-card')).toContainText(
      'Recent tool calls appear in Agent View for this browser session. Exported proof records verified product events and hashes.',
    );
    await expect(page.getByTestId('autopilot-card')).not.toContainText(/Every call.*proof ledger/i);
    // Aperture table lists the passed-phase tools highlighted.
    const table = page.getByTestId('aperture-table');
    await expect(table.getByText('compile_skill_bundle')).toBeVisible();
    await expect(table.getByText('read_cherry_context')).toBeVisible();
    // No fake registrations or calls in manual mode.
    await expect(page.getByTestId('registered-empty')).toBeVisible();
    await expect(page.getByTestId('calls-empty')).toBeVisible();
  });

  test('teach CTA routes into the Quick Skill wizard once a workspace exists', async ({ page }) => {
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Exit walkthrough' }).click();
    await page.goto('/studio?teach=1');
    await expect(page).toHaveURL(/\/studio\/quick$/);
    await expect(page.getByRole('heading', { name: 'Quick Skill' })).toBeVisible();
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

test.describe('quick skill wizard', () => {
  test('URL to installable skill: transcript in, approved bundle out', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/studio/quick');
    await expect(page.getByRole('heading', { name: 'Quick Skill' })).toBeVisible();

    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(
      [
        '0:05 Create a new frame for the hero section',
        '0:40 Always keep the heading a real h1 for accessibility',
        '1:10 Add the navigation bar with pill buttons',
        '1:50 Check the spacing against the grid',
      ].join('\n'),
    );
    await page.getByTestId('quick-source-next').click();

    // Raw text reaches review without a transcript interstitial.
    await expect(page.getByTestId('quick-steps')).toBeVisible();
    const checkboxes = page.getByTestId('quick-steps').locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeChecked();
    const stepCount = await checkboxes.count();
    expect(stepCount).toBeGreaterThanOrEqual(3);

    await page.getByTestId('quick-generate').click();

    // Approval remains a human action on the exact reviewed version.
    await expect(page.getByTestId('quick-ready')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/approved r\d+ by you/)).toBeVisible();
    await expect(page.getByText(/Checks: passed/)).toBeVisible();

    // The skill is a real record: open it in the Skills library.
    await page.getByRole('link', { name: 'Open Library' }).click();
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    // Nodes carry transcript evidence.
    await expect(page.getByRole('heading', { name: 'Where this came from' })).toBeVisible();
    await expect(page.getByText(/[1-9] source notes?/)).toBeVisible();
  });

  test('wizard refuses an empty transcript path honestly', async ({ page }) => {
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill('   ');
    await page.getByTestId('quick-source-next').click();
    await expect(page.getByRole('alert')).toContainText('Paste a link or text');
  });
});

test.describe('notebook (sources · overview · studio)', () => {
  test('drop sources, get an instant overview, generate a real briefing artifact', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(
      [
        '0:05 Create a hero section with a real heading for the landing page',
        '0:40 The hero section needs a main landmark so screen readers find the landing page',
        '1:20 Always check color contrast on the hero section before shipping',
      ].join('\n'),
    );
    await page.getByTestId('quick-source-next').click();

    // Three-pane notebook appears with an instant deterministic overview.
    await expect(page.getByTestId('notebook')).toBeVisible();
    await expect(page.getByTestId('notebook-overview')).toBeVisible();
    await expect(page.getByTestId('notebook-topics').locator('.sticker').first()).toBeVisible();
    await expect(page.getByTestId('source-card')).toHaveCount(1);

    // Second source appends and shows as a second card.
    await page.getByTestId('quick-add-source').click();
    await page.getByTestId('quick-transcript').fill('Check the hero section spacing on mobile before release.');
    await page.getByTestId('quick-transcript-next').click();
    await expect(page.getByTestId('source-card')).toHaveCount(2);

    // Studio output: real briefing.md — downloaded AND saved into mission files.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('studio-briefing').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('briefing.md');
    await expect(page.getByText(/briefing\.md saved to the project files/)).toBeVisible();

    // The briefing is a genuine artifact: generate the skill, open mission files.
    await page.getByTestId('quick-generate').click();
    await expect(page.getByTestId('quick-ready')).toBeVisible({ timeout: 20_000 });
  });
});
