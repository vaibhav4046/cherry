#!/usr/bin/env node
/**
 * Brutal judge sweep against a DEPLOYED Cherry.
 *
 * Not a unit test. This opens the real site the way a judge would, on desktop
 * and on a phone, and reports anything that would cost a point: console errors,
 * failed requests, dead links, layout overflow, missing landmarks, unlabelled
 * controls, and pages that render nothing.
 *
 * Usage: node scripts/judge-sweep.mjs [--base https://cherry-wine.vercel.app]
 */
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag('base', 'https://cherry-wine.vercel.app');

const ROUTES = ['/', '/showcase', '/compatibility', '/connect', '/studio/agent', '/studio/skills', '/studio/control'];

const findings = [];
const note = (severity, route, viewport, detail) => findings.push({ severity, route, viewport, detail });

async function sweep(browser, viewportName, contextOptions) {
  const context = await browser.newContext(contextOptions);
  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const badRequests = [];

    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    page.on('requestfailed', (r) => badRequests.push(`${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url().slice(0, 120)}`); });

    let status = 'no-response';
    try {
      const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
      status = res ? String(res.status()) : 'no-response';
      await page.waitForTimeout(1200);
    } catch (error) {
      note('BLOCKER', route, viewportName, `navigation failed: ${String(error).slice(0, 140)}`);
      await page.close();
      continue;
    }

    if (status !== '200') note('BLOCKER', route, viewportName, `HTTP ${status}`);

    /* The callback below is serialised and executed inside the page, where the
       browser globals exist; eslint reads this file as Node source. */
    /* eslint-disable no-undef */
    const audit = await page.evaluate(() => {
      const doc = document.documentElement;
      const visibleText = (document.body.innerText || '').trim();
      const controls = [...document.querySelectorAll('button, a[href], [role="button"]')];
      const unlabelled = controls.filter((el) => {
        const text = (el.textContent || '').trim();
        return !text && !el.getAttribute('aria-label') && !el.getAttribute('title');
      }).length;
      return {
        title: document.title,
        textLength: visibleText.length,
        horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
        overflowBy: doc.scrollWidth - doc.clientWidth,
        h1Count: document.querySelectorAll('h1').length,
        mainCount: document.querySelectorAll('main').length,
        imagesNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
        unlabelledControls: unlabelled,
        emptyHrefs: [...document.querySelectorAll('a[href="#"], a[href=""]')].length,
      };
    });
    /* eslint-enable no-undef */

    if (audit.textLength < 200) note('BLOCKER', route, viewportName, `renders almost nothing (${audit.textLength} chars)`);
    if (!audit.title || audit.title.length < 5) note('HIGH', route, viewportName, `weak or missing <title>: "${audit.title}"`);
    if (audit.horizontalOverflow) note('HIGH', route, viewportName, `horizontal overflow by ${audit.overflowBy}px`);
    if (audit.h1Count !== 1) note('MEDIUM', route, viewportName, `${audit.h1Count} <h1> elements (want exactly 1)`);
    if (audit.mainCount !== 1) note('MEDIUM', route, viewportName, `${audit.mainCount} <main> landmarks (want exactly 1)`);
    if (audit.imagesNoAlt > 0) note('MEDIUM', route, viewportName, `${audit.imagesNoAlt} images without alt`);
    if (audit.unlabelledControls > 0) note('HIGH', route, viewportName, `${audit.unlabelledControls} controls with no accessible name`);
    if (audit.emptyHrefs > 0) note('MEDIUM', route, viewportName, `${audit.emptyHrefs} placeholder links (href="#")`);

    for (const e of pageErrors) note('BLOCKER', route, viewportName, `uncaught: ${e}`);
    for (const e of consoleErrors) note('HIGH', route, viewportName, `console.error: ${e}`);
    for (const r of badRequests) note('HIGH', route, viewportName, `request: ${r}`);

    await page.close();
  }
  await context.close();
}

const browser = await chromium.launch();
await sweep(browser, 'desktop-1440', { viewport: { width: 1440, height: 900 } });
await sweep(browser, 'pixel-7', { ...devices['Pixel 7'] });
await browser.close();

const order = { BLOCKER: 0, HIGH: 1, MEDIUM: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);

console.log(`\nJudge sweep against ${BASE}`);
console.log(`${findings.length} finding(s)\n`);
for (const f of findings) {
  console.log(`${f.severity.padEnd(8)} ${f.viewport.padEnd(13)} ${f.route.padEnd(17)} ${f.detail}`);
}
if (findings.length === 0) console.log('clean');
process.exit(findings.some((f) => f.severity === 'BLOCKER') ? 1 : 0);
