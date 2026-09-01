import { expect, test } from '@playwright/test';

const DESCRIPTION = 'meta[name="description"]';
const TEST_PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID?.trim() || 'clp_cherry_e2e_guest_mode';

test.describe('guest performance boundary', () => {
  test('configured guest routes never request the Privy SDK or its services', async ({ page, request }) => {
    expect(TEST_PRIVY_APP_ID.length).toBeGreaterThan(0);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    for (const path of ['/', '/showcase', '/studio']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    const resources = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    const forbidden = [...new Set([...requests, ...resources])].filter((url) => {
      const parsed = new URL(url);
      return (
        /privy-provider|walletconnect|reown/i.test(parsed.pathname) ||
        parsed.hostname === 'privy.io' ||
        parsed.hostname.endsWith('.privy.io')
      );
    });
    expect(forbidden).toEqual([]);
    await expect(page.locator('link[rel="modulepreload"][href*="privy-provider"]')).toHaveCount(0);

    const mainScript = await page.locator('script[type="module"][src]').getAttribute('src');
    expect(mainScript).not.toBeNull();
    const mainChunk = await request.get(mainScript!);
    expect(await mainChunk.text()).toContain(TEST_PRIVY_APP_ID);
  });
});

test.describe('route metadata', () => {
  test('uses specific metadata for real public and Studio routes', async ({ page }) => {
    const cases = [
      {
        path: '/connect',
        title: 'Connect your agent · Cherry Wine',
        description: 'Bring ChatGPT, Codex, Claude, or any MCP agent. Open standards, no API keys.',
      },
      {
        path: '/Connect',
        title: 'Connect your agent · Cherry Wine',
        description: 'Bring ChatGPT, Codex, Claude, or any MCP agent. Open standards, no API keys.',
      },
      {
        path: '/connec%74',
        title: 'Connect your agent · Cherry Wine',
        description: 'Bring ChatGPT, Codex, Claude, or any MCP agent. Open standards, no API keys.',
      },
      {
        path: '/studio/missions/new',
        title: 'New project · Cherry Wine',
        description: 'Define what your agent should produce and the real checks it must pass.',
      },
      {
        path: '/studio/settings/connections',
        title: 'Connections · Cherry Wine',
        description: 'Pair your local runner, connect agents, or keep working entirely in this browser.',
      },
      {
        path: '/studio/runs',
        title: 'Runs · Cherry Wine',
        description: 'See what ran, what passed, and what needs your attention.',
      },
    ] as const;

    for (const route of cases) {
      await page.goto(route.path);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator(DESCRIPTION)).toHaveAttribute('content', route.description);
    }
  });

  test('prefix lookalikes and unknown Studio children keep 404 metadata', async ({ page }) => {
    for (const path of ['/connectivity', '/showcase-bogus', '/studioish', '/studio/not-a-route']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'This page is missing.' })).toBeVisible();
      await expect(page).toHaveTitle('Page not found · Cherry Wine');
      await expect(page.locator(DESCRIPTION)).toHaveAttribute(
        'content',
        'That page does not exist. The rest of Cherry does.',
      );
    }
  });

  test('serves the valid Open Graph image and wine SVG favicon', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/cherry.svg');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://cherry-wine.vercel.app/og.jpg',
    );

    const image = await request.get('/og.jpg');
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/jpeg');

    const favicon = await request.get('/cherry.svg');
    expect(favicon.ok()).toBe(true);
    const faviconBody = await favicon.text();
    expect(faviconBody).toContain('#8c1d2f');
    expect(faviconBody).toContain('#731826');
  });

  test('keeps the custom 404 available from the cached offline shell', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return;
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      });
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: /Turn a lesson into a skill/i })).toBeVisible();

    await context.setOffline(true);
    try {
      await page.goto('/offline-missing');
      await expect(page.getByRole('heading', { name: 'This page is missing.' })).toBeVisible();
      await expect(page).toHaveTitle('Page not found · Cherry Wine');
    } finally {
      await context.setOffline(false);
    }
  });
});
