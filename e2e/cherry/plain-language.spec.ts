import { expect, test, type Locator } from '@playwright/test';

const implementationTerms = /\b(?:skill\s*graphs?|apertures?|provenance|artifact sets?|actors?|revision bindings?|proof\s*receipts?|workspaces?|missions?|lessons?)\b/i;

async function expectPlainLanguage(target: Locator) {
  await expect(target).not.toContainText(implementationTerms);
  const accessibleCopy = await target.locator('[aria-label], [title], [placeholder]').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const node = element as HTMLElement;
        const style = window.getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none';
      })
      .flatMap((element) => ['aria-label', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? ''))
      .join('\n'),
  );
  expect(accessibleCopy).not.toMatch(implementationTerms);
}

test.describe('plain-language Studio', () => {
  test('keeps the first skill path focused on user outcomes', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Teach Cherry something' })).toBeVisible();
    await expect(page.getByLabel('Space name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create space' })).toBeVisible();
    await expectPlainLanguage(page.locator('body'));

    await page.getByLabel('Space name').fill('Plain language');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Proof history' })).toBeVisible();

    await page.goto('/studio/missions/new');
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible();
    await expectPlainLanguage(page.locator('main'));

    await page.goto('/studio/runs');
    await expect(page.getByText('No runs yet. Start with a source, then Cherry records each attempt and its real checks separately.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a source' })).toBeVisible();
    await expectPlainLanguage(page.locator('main'));

    await page.goto('/studio/proof');
    await expect(page.getByText('No proof yet. Add a source, build a skill, and run its checks first.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a source' })).toBeVisible();
    await expectPlainLanguage(page.locator('main'));

    await page.goto('/studio/memory');
    await expect(page.getByRole('button', { name: 'Propose memory' })).toBeVisible();
    await expectPlainLanguage(page.locator('main'));

    await page.goto('/studio');

    await page.getByRole('button', { name: 'Add a source' }).click();
    const sourceDialog = page.getByRole('dialog', { name: 'Add a source' });
    await expect(sourceDialog).toContainText('where each came from');
    await expect(sourceDialog).toContainText('what the source said, with timestamps');
    await expectPlainLanguage(sourceDialog);
    await sourceDialog.getByRole('button', { name: 'Close' }).click();

    await page.goto('/studio/sources');
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await page.getByRole('button', { name: 'Save a source' }).first().click();
    const saveSource = page.getByRole('dialog', { name: 'Save a source' });
    await expect(saveSource.getByRole('button', { name: /YouTube video/ })).toBeVisible();
    await expectPlainLanguage(saveSource);
    await saveSource.getByRole('button', { name: 'Close save source dialog' }).click();
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);
    await expectPlainLanguage(page.locator('body'));

    await page.goto('/studio/quick');
    await page.getByLabel('Paste a YouTube link, an article link, or raw text.').fill(
      [
        '0:05 Draft the release checklist from the chosen source.',
        '0:40 Check every claim before publishing.',
        '1:10 Save the checked method for the next release.',
      ].join('\n'),
    );
    await page.getByTestId('quick-source-next').click();
    await expect(page.getByTestId('notebook')).toBeVisible();
    await expect(page.getByTestId('notebook-overview')).toContainText('copied from your sources and links back');
    await expectPlainLanguage(page.locator('body'));

    await page.getByTestId('quick-generate').click();
    const ready = page.getByTestId('quick-ready');
    await expect(ready).toBeVisible();
    await expect(ready).toContainText(/approved r\d+ by you/);
    await expect(ready).toContainText(/\d+ steps/);
    await expect(ready).toContainText(/Checks: passed/);
    await expect(ready.getByRole('button', { name: 'See proof' })).toBeVisible();
    await expectPlainLanguage(ready);

    await ready.getByRole('link', { name: 'Open Library' }).click();
    await expect(page.getByTestId('skill-status')).toContainText('approved');
    await expectPlainLanguage(page.locator('body'));

    await page.goto('/studio/skills');
    await expect(page.getByLabel('Search skills')).toBeVisible();
    await expectPlainLanguage(page.locator('body'));
    await page.getByLabel('Search skills').fill('no matching skill');
    await expect(page.getByText('Nothing matches that search.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('library-card')).toBeVisible();

    await page.goto('/studio/routines');
    await expect(page.getByRole('heading', { name: 'Routines', exact: true })).toBeVisible();
    await expectPlainLanguage(page.locator('body'));

    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByText(/^Proof created \(/)).toBeVisible();
    await expectPlainLanguage(page.locator('body'));

    await page.goto('/studio/onboarding');
    await expect(page.getByRole('heading', { name: 'Setup check' })).toBeVisible();
    await expect(page.locator('p.subhead')).toContainText(/Agent connection: (Connected|Not connected)/);
    await expectPlainLanguage(page.locator('body'));
  });

  test('keeps the guided walkthrough free of implementation nouns', async ({ page }) => {
    await page.goto('/studio?demo=1');
    const tour = page.getByTestId('guided-tour');
    await expect(tour).toBeVisible({ timeout: 20_000 });

    while (await tour.getByTestId('tour-next').isVisible()) {
      await expectPlainLanguage(tour);
      await tour.getByTestId('tour-next').click();
    }

    await expectPlainLanguage(tour);
    await expect(tour.getByRole('heading', { name: 'Take it anywhere' })).toBeVisible();
  });
});
