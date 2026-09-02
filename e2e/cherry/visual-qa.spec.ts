import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Final visual + accessibility QA sweep over the public pages and the four
 * Studio entry routes, at desktop and phone widths. Every check here is
 * observable in the rendered page: no horizontal overflow, zero console
 * errors, axe-clean (serious/critical), a visible focus ring on every
 * tabbable control, no unnamed buttons/links, and no skipped heading levels.
 * Screenshots land in docs/release/screenshots/final-qa/ as evidence.
 */

const OUT_DIR = 'docs/release/screenshots/final-qa';
const CAPTURE_EVIDENCE = process.env.CHERRY_CAPTURE_VISUAL_EVIDENCE === '1';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const PUBLIC_ROUTES = [
  { path: '/', ready: 'One task. An entire AI team.' },
  { path: '/showcase', ready: 'Watch a lesson become a proven skill' },
  { path: '/connect', ready: 'Bring the agent you already pay for' },
  { path: '/compatibility', ready: 'Compatibility & proof' },
] as const;

const STUDIO_ROUTES = [
  { path: '/studio', ready: /Teach Cherry something|Command Center/ },
  { path: '/studio/sources', ready: /Sources/ },
  { path: '/studio/quick', ready: /Quick Skill/ },
  { path: '/studio/skills', ready: /Skill Library|Skills/ },
] as const;

const ACCENT_OUTLINE = 'rgb(140, 29, 47)';

function slug(path: string): string {
  return path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-');
}

function screenshotPath(testInfo: TestInfo, filename: string): string {
  return CAPTURE_EVIDENCE ? `${OUT_DIR}/${filename}` : testInfo.outputPath(filename);
}

/**
 * Known, documented exception (outside the visual lane): the Studio probes the
 * optional local runner on loopback, and Chrome logs a refused connection as a
 * console error when no runner is paired. Counted separately, never hidden.
 */
const RUNNER_PROBE = /^http:\/\/127\.0\.0\.1:\d+\/status$/;

function collectConsoleErrors(page: Page): { errors: string[]; runnerProbeErrors: string[] } {
  const errors: string[] = [];
  const runnerProbeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    const entry = `${message.text()} @ ${url}`;
    (RUNNER_PROBE.test(url) ? runnerProbeErrors : errors).push(entry);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    // A media range request the browser itself cancels on navigation is not a failure.
    if (reason === 'net::ERR_ABORTED') return;
    const entry = `requestfailed: ${request.url()} (${reason})`;
    (RUNNER_PROBE.test(request.url()) ? runnerProbeErrors : errors).push(entry);
  });
  return { errors, runnerProbeErrors };
}

async function assertPageHealth(page: Page, label: string) {
  await expect(
    page.locator('[data-testid="cherry-home-link"] img[src="/cherry.svg"]'),
    `${label}: canonical Cherry home mark`,
  ).toHaveCount(1);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.help} -> ${violation.nodes
          .map((node) => `${node.target.join(' ')} [${node.failureSummary?.split('\n')[1]?.trim() ?? ''}]`)
          .join(' | ')}`,
    ),
    `${label}: axe serious/critical`,
  ).toEqual([]);

  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter((element) => element.offsetParent !== null)
      .filter((element) => {
        const text = (element.textContent ?? '').trim();
        const label = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? '';
        const labelledBy = element.getAttribute('aria-labelledby');
        return text === '' && label.trim() === '' && !labelledBy;
      })
      .map((element) => element.outerHTML.slice(0, 120)),
  );
  expect(unnamed, `${label}: controls without an accessible name`).toEqual([]);

  const headingSkips = await page.evaluate(() => {
    const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) =>
      Number(heading.tagName.slice(1)),
    );
    const skips: string[] = [];
    levels.forEach((level, index) => {
      const previous = index === 0 ? 0 : levels[index - 1]!;
      if (level > previous + 1) skips.push(`h${previous} -> h${level} at heading ${index + 1}`);
    });
    return { first: levels[0] ?? null, skips };
  });
  expect(headingSkips.first, `${label}: first heading is an h1`).toBe(1);
  expect(headingSkips.skips, `${label}: skipped heading levels`).toEqual([]);
}

/** Tab through the first controls and require a visible, on-system focus ring. */
async function assertFocusRings(page: Page, label: string, limit = 14) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('Tab');
  const seen: string[] = [];
  const offSystem: string[] = [];
  for (let index = 0; index < limit; index += 1) {
    const focus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return null;
      const style = getComputedStyle(active);
      return {
        tag: active.tagName.toLowerCase(),
        text: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 40),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
      };
    });
    if (!focus) break;
    seen.push(`${focus.tag}:${focus.text}`);
    const visible = focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) >= 2;
    expect(visible, `${label}: focus ring on ${focus.tag} "${focus.text}"`).toBe(true);
    if (focus.outlineColor !== ACCENT_OUTLINE) offSystem.push(`${focus.tag} "${focus.text}" -> ${focus.outlineColor}`);
    await page.keyboard.press('Tab');
  }
  expect(seen.length, `${label}: tabbable controls reached`).toBeGreaterThan(0);
  expect(offSystem, `${label}: focus rings that are not the accent`).toEqual([]);
}

test.describe('final visual and accessibility QA', () => {
  test.beforeAll(() => {
    if (CAPTURE_EVIDENCE) mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`public pages at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const { errors, runnerProbeErrors } = collectConsoleErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of PUBLIC_ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.ready })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: screenshotPath(testInfo, `${viewport.name}-${slug(route.path)}.png`), fullPage: true });
        await assertPageHealth(page, `${route.path}@${viewport.name}`);
        if (viewport.name === 'desktop') await assertFocusRings(page, route.path);
      }

      expect(errors, `console errors on public pages @${viewport.name}`).toEqual([]);
      expect(runnerProbeErrors, `public pages must not probe the local runner @${viewport.name}`).toEqual([]);
    });

    test(`studio setup-required states at ${viewport.name}`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const { errors, runnerProbeErrors } = collectConsoleErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of STUDIO_ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.ready }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: screenshotPath(testInfo, `${viewport.name}-${slug(route.path)}-empty.png`), fullPage: true });
        await assertPageHealth(page, `${route.path} (empty)@${viewport.name}`);
        if (viewport.name === 'desktop') await assertFocusRings(page, `${route.path} (empty)`);
      }

      expect(errors, `console errors on empty studio @${viewport.name}`).toEqual([]);
      console.log(`[visual-qa] empty studio @${viewport.name}: ${runnerProbeErrors.length} refused runner probe(s) (known, outside lane)`);
    });

    test(`studio populated by the guided example at ${viewport.name}`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const { errors, runnerProbeErrors } = collectConsoleErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/studio?demo=1');
      await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Exit walkthrough' }).click();

      for (const route of STUDIO_ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.ready }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: screenshotPath(testInfo, `${viewport.name}-${slug(route.path)}-populated.png`), fullPage: true });
        await assertPageHealth(page, `${route.path} (populated)@${viewport.name}`);
      }

      expect(errors, `console errors on populated studio @${viewport.name}`).toEqual([]);
      console.log(`[visual-qa] populated studio @${viewport.name}: ${runnerProbeErrors.length} refused runner probe(s) (known, outside lane)`);
    });
  }
});
