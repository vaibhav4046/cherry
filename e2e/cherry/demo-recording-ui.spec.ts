import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const RECORDING_LABEL =
  'Uncut recording of the automated end-to-end test driving the real product. Nothing staged.';

test.describe('real-run recording presentation', () => {
  test('showcase exposes the labelled, accessible native recording', async ({ page }) => {
    await page.goto('/showcase#real-run');

    const section = page.locator('#real-run');
    await expect(section.getByRole('heading', { name: 'Watch the real run' })).toBeVisible();
    await expect(section.getByText(RECORDING_LABEL, { exact: true })).toBeVisible();

    const recording = section.locator('video');
    await expect(recording).toHaveAttribute('aria-label', 'Watch the real run');
    await expect(recording).toHaveAttribute('controls', '');
    await expect(recording).toHaveAttribute('preload', 'metadata');
    await expect(recording).toHaveAttribute('playsinline', '');
    await expect(recording).toHaveAttribute('src', '/media/demo/golden-loop.webm');

    const response = await page.request.get('/media/demo/golden-loop.webm');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('video/webm');

    const playback = await recording.evaluate(async (element) => {
      const video = element as HTMLVideoElement;
      video.muted = true;

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(video.error), { once: true });
          video.load();
        });
      }

      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const state = {
        duration: video.duration,
        height: video.videoHeight,
        paused: video.paused,
        width: video.videoWidth,
      };
      video.pause();
      return state;
    });

    expect(playback).toMatchObject({ height: 720, paused: false, width: 1280 });
    expect(playback.duration).toBeGreaterThan(30);
    expect(playback.duration).toBeLessThan(60);

    const results = await new AxeBuilder({ page }).include('#real-run').analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  test('landing links the every-agent band to the real run', async ({ page }) => {
    await page.goto('/');

    const band = page.getByRole('heading', { name: 'Teach once. Every agent gets better.' }).locator('..');
    const link = band.getByRole('link', { name: 'Watch the real run' });
    await expect(link).toHaveAttribute('href', '/showcase#real-run');
  });
});
