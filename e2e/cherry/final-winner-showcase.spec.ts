import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

function watchPageFailures(page: Page) {
  const failures: string[] = [];
  page.on('console', (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error: Error) => failures.push(`page: ${error.message}`));
  page.on('response', (response: { status(): number; url(): string }) => {
    if (response.status() === 404) failures.push(`404: ${response.url()}`);
  });
  return failures;
}

test('fresh showcase tells the evidence-first mission story and retains the Learn chapter', async ({ page }) => {
  const failures = watchPageFailures(page);
  await page.goto('/showcase');

  await expect(page.getByRole('heading', { name: 'Two agents ran one job. Neither could publish.' })).toBeVisible();
  await expect(page.getByText('Judging this? The whole run is below, and takes about 90 seconds to read.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recorded real Codex run' })).toBeVisible();

  const chapters = page.locator('[data-showcase-chapter]');
  await expect(chapters).toHaveCount(4);
  await expect(chapters.nth(0)).toContainText('Outcome');
  await expect(chapters.nth(1)).toContainText('Parallel work');
  await expect(chapters.nth(2)).toContainText('Verification');
  await expect(chapters.nth(3)).toContainText('Approval');

  const film = page.getByLabel('Silent mission film');
  await expect(film).toHaveAttribute('src', '/media/cherry-demo/mission-hero.webm');
  await expect(film).toHaveAttribute('poster', '/media/cherry-chronicle/artifacts/seed-outcome-desktop.svg');
  await expect(page.getByRole('heading', { name: 'How Cherry learns a procedure' })).toBeVisible();
  await expect(page.getByTestId('showcase-start-fresh')).toBeVisible();
  await expect(page.getByTestId('showcase-load-sample')).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  expect(failures).toEqual([]);
});

test('recorded mission controls work from the keyboard and expose evidence', async ({ page }) => {
  await page.goto('/showcase');
  const player = page.getByRole('region', { name: 'Recorded real Codex run' });
  await expect(player).toContainText('Step 1 of 6');

  await page.getByRole('button', { name: 'Next step' }).focus();
  await page.keyboard.press('Enter');
  await expect(player).toContainText('Step 2 of 6');
  await expect(page.getByRole('status')).toContainText('Step 2 of 6: Plan bounded');

  await page.getByRole('button', { name: 'Open evidence' }).focus();
  await page.keyboard.press('Enter');
  const evidence = page.getByRole('region', { name: 'Run evidence' });
  await expect(evidence).toContainText('34,513 ms measured overlap');
  await expect(evidence).toContainText('codex-cli 0.152.1');
  await expect(evidence).toContainText('worktree-process');
});

test('reduced motion shows a still and never autoplays the replay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/showcase');

  await expect(page.getByTestId('mission-film-still')).toBeVisible();
  await expect(page.getByLabel('Silent mission film')).toBeHidden();
  const player = page.getByRole('region', { name: 'Recorded real Codex run' });
  await expect(player).toHaveAttribute('data-playing', 'false');
  await page.waitForTimeout(3_200);
  await expect(player).toContainText('Step 1 of 6');
});

test('390px presentation has no horizontal overflow or broken assets', async ({ page }) => {
  const failures = watchPageFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/showcase');
  await expect(page.getByRole('heading', { name: 'Two agents ran one job. Neither could publish.' })).toBeVisible();
  const sizes = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.viewportWidth);
  expect(failures).toEqual([]);
});
