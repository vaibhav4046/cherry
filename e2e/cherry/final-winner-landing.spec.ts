import { statSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const;

function watchForBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() === 404) failures.push(`404: ${response.url()}`);
  });
  return failures;
}

async function expectInsideFirstViewport(locator: Locator, height: number) {
  const box = await locator.boundingBox();
  expect(box, 'element should have a layout box').not.toBeNull();
  expect(box!.y, 'element starts below the first viewport').toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'element ends below the first viewport').toBeLessThanOrEqual(height);
}

for (const viewport of viewports) {
  test(`${viewport.name} leads with the recorded mission and has no overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const failures = watchForBrowserFailures(page);
    await page.goto('/');

    const player = page.getByRole('region', { name: 'Recorded real Codex run' });
    await expect(player).toBeVisible();
    const recordingLabel = page.getByText('Recording · committed evidence · not live', { exact: true });
    await expect(recordingLabel).toBeVisible();
    await expect(player.locator('.recorded-mission__counter')).toHaveText(/Step 1 of \d+/);
    await expect(player.getByRole('heading', { name: 'Outcome recorded' })).toBeVisible();
    const play = player.getByRole('button', { name: 'Play' });
    await expect(play).toBeVisible();

    await expectInsideFirstViewport(recordingLabel, viewport.height);
    await expectInsideFirstViewport(player.getByRole('heading', { name: 'Outcome recorded' }), viewport.height);
    await expectInsideFirstViewport(play, viewport.height);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures).toEqual([]);

    await page.screenshot({ path: `test-results/w2-first-${viewport.name}.png` });
    const images = page.locator('[data-chronicle-art] img');
    await expect(images).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/w2-${viewport.name}.png`,
      fullPage: true,
    });
  });
}

test('story chapters, Chronicle art, and recorded facts stay honest', async ({ page }) => {
  const failures = watchForBrowserFailures(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Recorded real Codex run' })).toBeVisible();

  const chapters = page.locator('[data-landing-chapter]');
  await expect(chapters).toHaveCount(6);
  expect(await chapters.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-landing-chapter')))).toEqual([
    'seed',
    'branch',
    'glasshouse',
    'harvest',
    'human-seal',
    'seed-bank',
  ]);
  await expect(page.getByTestId('recorded-overlap')).toContainText('34,513 ms');
  await expect(page.getByText('codex-cli 0.152.1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('worktree-process', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/an agent cannot approve or publish/i)).toBeVisible();
  await expect(page.locator('[data-chronicle-art] img')).toHaveCount(5);
  const cabinet = page.getByTestId('proof-cabinet');
  await expect(cabinet.locator('[data-verified-demo]')).toHaveCount(4);
  await expect(cabinet.getByRole('link', { name: /Real Codex team run/i })).toHaveAttribute('href', '/showcase#recorded-mission');
  const threeLab = cabinet.getByRole('link', { name: /Interactive Three\.js lab/i });
  await expect(threeLab).toHaveAttribute('href', '/lab/cherry-3d/');
  await expect(threeLab).toContainText('Explore three procedural brand scenes and export OBJ/MTL.');
  await expect(threeLab).not.toContainText(/GLB/i);
  await expect(cabinet.getByRole('link', { name: /Uncut skill workflow/i })).toHaveAttribute('href', '/showcase#real-run');
  await expect(cabinet.getByRole('link', { name: /Codex \+ Cherry MCP proof/i })).toHaveAttribute('href', '/compatibility');
  await expect(cabinet).not.toContainText(/AAA|Sora|Sol|Terra|Luna|live ChatGPT/i);
  await expect(page.getByText(/Download for Windows|24\/7|laptop is closed|Connected to LinkedIn/i)).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('mobile keyboard, reduced motion, and accessibility remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures = watchForBrowserFailures(page);
  await page.goto('/');
  const player = page.getByRole('region', { name: 'Recorded real Codex run' });
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute('data-playing', 'false');

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to the Cherry story' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#landing-story')).toBeFocused();

  const next = player.getByRole('button', { name: 'Next step' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(player.locator('.recorded-mission__counter')).toHaveText(/Step 2 of \d+/);
  const outlineStyle = await next.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outlineStyle).not.toBe('none');

  const runningAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
  expect(runningAnimations).toBe(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(failures).toEqual([]);
});

test('the promoted Three.js lab renders, switches all scenes, and exports real OBJ and MTL files', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:4173' && response.status() === 404) {
      failures.push(`local 404: ${response.url()}`);
    }
  });

  const response = await page.goto('/lab/cherry-3d/');
  expect(response?.ok()).toBe(true);
  const stage = page.locator('three-d-stage');
  await expect(stage).toBeVisible();
  await expect.poll(() => stage.evaluate(async (node) => {
    const element = node as HTMLElement & {
      ready: Promise<unknown>;
      _object?: { name?: string };
    };
    await element.ready;
    const canvas = element.shadowRoot?.querySelector('canvas');
    return {
      canvasWidth: canvas?.width ?? 0,
      name: element.getAttribute('name'),
      objectName: element._object?.name,
    };
  })).toMatchObject({ canvasWidth: expect.any(Number), name: 'cherry-twins', objectName: 'cherry-twins' });
  expect(await stage.evaluate((node) => node.shadowRoot?.querySelector('canvas')?.width ?? 0)).toBeGreaterThan(0);

  const scenes = [
    { button: 'Cherry Twins', name: 'cherry-twins' },
    { button: 'Coupe & Garnish', name: 'cherry-coupe' },
    { button: 'The Bottle', name: 'cherry-wine-bottle' },
  ] as const;
  for (const scene of scenes) {
    const button = page.getByRole('button', { name: scene.button, exact: true });
    await button.click();
    await expect(button).toHaveClass(/\bon\b/);
    await expect(stage).toHaveAttribute('name', scene.name);
    await expect.poll(() => stage.evaluate((node) => {
      const element = node as HTMLElement & { _object?: { name?: string } };
      return element._object?.name;
    })).toBe(scene.name);
  }

  const downloads: Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.getByRole('button', { name: 'Download OBJ + MTL', exact: true }).click();
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);
  expect(downloads.map((download) => download.suggestedFilename()).sort()).toEqual([
    'cherry-wine-bottle.mtl',
    'cherry-wine-bottle.obj',
  ]);
  for (const download of downloads) {
    expect(await download.failure()).toBeNull();
    const savedPath = await download.path();
    if (!savedPath) throw new Error(`${download.suggestedFilename()} has no saved path`);
    expect(statSync(savedPath).size).toBeGreaterThan(0);
  }
  expect(failures).toEqual([]);
});
