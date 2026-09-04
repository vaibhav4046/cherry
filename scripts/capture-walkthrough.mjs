#!/usr/bin/env node
/**
 * Stills for the interactive walkthrough, captured from the live deployment.
 *
 * One image per step, same viewport throughout, so the walkthrough reads as a
 * single session rather than a scrapbook. The WebMCP steps run with Cherry's
 * opt-in stand-in host, which is what makes the aperture visible on the page.
 *
 * Usage: node scripts/capture-walkthrough.mjs [--base <url>] [--out <dir>]
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag('base', 'https://cherry-wine.vercel.app').replace(/\/$/, '');
const OUT = flag('out', 'docs/release/screenshots/walkthrough');

/** route, scroll offset, file name, and the caption the step carries. */
const STEPS = [
  ['/', 0, '01-landing', 'Cherry runs supervised work on your own computer. Give it a goal; it plans, runs and checks the work, and comes back to you for the decisions.'],
  ['/', 520, '02-proof-rail', 'The numbers on the page are the run’s own: two tasks, two separate work areas, 34.5 seconds in parallel, two checks passed.'],
  ['/showcase', 0, '03-showcase', 'The claim, stated so you can attack it: two agents ran one job, and neither of them could publish it.'],
  ['/showcase', 900, '04-run-steps', 'Every step of the run is on the record — what ran, where, and what it produced.'],
  ['/showcase', 1600, '05-approval', 'Publishing stops at a human decision. No agent tool can make it.'],
  ['/studio/agent', 0, '06-aperture', 'Open Agent View with a WebMCP host attached: Cherry has registered eleven site tools for this page.'],
  ['/studio/agent', 620, '07-tool-table', 'The aperture is state-aware. Seven tools are always on; at most five more appear, and only when the state earns them.'],
  ['/studio/agent', 1300, '08-registrations', 'These are the live registrations and the real call log — the closures themselves, not a description of them.'],
  ['/compatibility', 0, '09-compatibility', 'Every host row says what was actually observed. ChatGPT desktop in Work mode is Validated because a real session did it.'],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    try { sessionStorage.setItem('cherry.standInHost', '1'); } catch { /* blocked storage */ }
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e).slice(0, 160)));

  const manifest = [];
  let current = '';
  for (const [route, offset, name, caption] of STEPS) {
    if (route !== current) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      current = route;
    }
    await page.evaluate((y) => globalThis.scrollTo({ top: y, behavior: 'instant' }), offset);
    await page.waitForTimeout(900);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    manifest.push({ step: manifest.length + 1, route, offset, file, caption });
  }

  await page.close();
  await context.close();
  await browser.close();
  await writeFile(path.join(OUT, 'walkthrough.json'), JSON.stringify({ base: BASE, capturedAt: new Date().toISOString(), steps: manifest, problems }, null, 2), 'utf8');
  console.log(JSON.stringify({ steps: manifest.length, out: OUT, problems }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
