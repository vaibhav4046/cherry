#!/usr/bin/env node
/**
 * Records the Cherry demo as a real browser session against a real deployment.
 *
 * Nothing here is a mockup: every frame is the deployed site responding to
 * real clicks, and the WebMCP segment uses Cherry's own opt-in stand-in host,
 * which is labelled as a stand-in on screen and in the subtitles. The live
 * ChatGPT capture is a separate, human-witnessed artefact and is cited, not
 * re-enacted.
 *
 * Usage: node scripts/record-demo.mjs [--base https://cherry-wine.vercel.app] [--out work/recording]
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag('base', 'https://cherry-wine.vercel.app').replace(/\/$/, '');
const OUT = flag('out', 'work/recording');
const WIDTH = 1280;
const HEIGHT = 720;

const beats = [];
let clock = 0;
let t0 = 0;
const elapsed = () => (t0 ? (Date.now() - t0) / 1000 : 0);
/** Records what is on screen at what second, so the subtitles cannot drift from the footage. */
function beat(label, seconds) {
  // start is the real elapsed second in the recording; end is filled by the next beat.
  const previous = beats.at(-1);
  if (previous) previous.end = Number(elapsed().toFixed(2));
  beats.push({ start: Number(elapsed().toFixed(2)), end: null, label, planned: seconds });
  clock += seconds;
  return seconds;
}

const wait = (page, ms) => page.waitForTimeout(ms);

/** A full-bleed title card, rendered in the browser so it shares the recording's colour pipeline. */
function card(kicker, headline, sub) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    html,body { margin:0; height:100%; background:#150609; }
    body { display:grid; place-items:center; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
    .wrap { width: 860px; text-align:left; }
    .kicker { font-size:13px; letter-spacing:.22em; text-transform:uppercase; color:#c9899a; margin:0 0 20px; }
    h1 { font-size:56px; line-height:1.08; margin:0; color:#fdf6f2; font-weight:600; letter-spacing:-0.02em; }
    p { font-size:20px; line-height:1.5; color:#c7aeb4; margin:22px 0 0; max-width:720px; }
    .rule { width:64px; height:2px; background:#8f1d2f; margin:28px 0 0; }
  </style><div class="wrap">
    <p class="kicker">${kicker}</p>
    <h1>${headline}</h1>
    ${sub ? `<p>${sub}</p>` : ''}
    <div class="rule"></div>
  </div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function scrollTo(page, y, ms = 900) {
  await page.evaluate((target) => globalThis.scrollTo({ top: target, behavior: 'smooth' }), y);
  await wait(page, ms);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
    reducedMotion: 'no-preference',
  });
  // Cherry feature-detects document.modelContext exactly once, at boot, so the
  // stand-in host has to be armed before the first navigation.
  await context.addInitScript(() => {
    try { sessionStorage.setItem('cherry.standInHost', '1'); } catch { /* first-party only */ }
  });
  t0 = Date.now();
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));

  // 1. Cold open.
  await page.goto(card('OpenAI WebMCP Challenge', 'Cherry', 'Supervised work on your computer, opened to any agent that speaks WebMCP.'));
  await wait(page, beat('Title card: Cherry', 4) * 1000);

  // 2. The deployed landing page, exactly as a judge would meet it.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(page, beat('Landing hero: "One task. An entire AI team."', 6) * 1000);
  await scrollTo(page, 520);
  await wait(page, beat('Landing proof rail: tasks, work areas, parallel time, checks', 5) * 1000);
  await scrollTo(page, 1180);
  await wait(page, beat('Landing: how the work is supervised', 5) * 1000);

  // 3. The showcase: the claim a judge is entitled to distrust.
  await page.goto(card('The receipt', 'Two agents ran one job.', 'Neither of them could publish it. That boundary is the product.'));
  await wait(page, beat('Title card: neither could publish', 4) * 1000);
  await page.goto(`${BASE}/showcase`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(page, beat('Showcase: recorded run of two agents on one job', 6) * 1000);
  await scrollTo(page, 700);
  await wait(page, beat('Showcase: the run, step by step', 5) * 1000);
  await scrollTo(page, 1500);
  await wait(page, beat('Showcase: the approval a human had to give', 5) * 1000);

  // 4. WebMCP: the aperture, live, with the stand-in host.
  await page.goto(card('WebMCP', 'The page hands an agent its tools.', 'Cherry registers a state-aware aperture. Shown here with Cherry’s own opt-in stand-in host.'));
  await wait(page, beat('Title card: WebMCP aperture (stand-in host)', 5) * 1000);
  await page.goto(`${BASE}/studio/agent`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(page, beat('Agent View: badge reads Agent connected, tools registered', 7) * 1000);
  await scrollTo(page, 620);
  await wait(page, beat('Agent View: the tool table, one row per registered closure', 6) * 1000);
  await scrollTo(page, 1300);
  await wait(page, beat('Agent View: the live call log', 5) * 1000);

  // 5. The real host, cited rather than re-enacted.
  await page.goto(card('Live host', 'ChatGPT desktop, Work mode.', 'A real host fetched the aperture and called the tools. Recorded in WEBMCP_LIVE_HOST_CAPTURE.md.'));
  await wait(page, beat('Title card: real ChatGPT desktop capture', 5) * 1000);
  await page.goto(`${BASE}/compatibility`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(page, beat('Compatibility: the live-host row, Validated', 6) * 1000);
  await scrollTo(page, 640);
  await wait(page, beat('Compatibility: what is shipped, what is not', 5) * 1000);

  // 6. Close.
  await page.goto(card('cherry-wine.vercel.app', 'Every claim on the site is checkable.', 'Open source, offline-first, and it refuses the one thing an agent must not do.'));
  await wait(page, beat('Closing card', 5) * 1000);

  await page.close();
  await context.close();
  await browser.close();

  // Playwright names videos by an internal id; give the file a name a human can use.
  const files = (await readdir(OUT)).filter((f) => f.endsWith('.webm'));
  let final = null;
  if (files.length === 1) {
    final = path.join(OUT, 'cherry-capture.webm');
    await rename(path.join(OUT, files[0]), final);
  }

  const last = beats.at(-1);
  if (last && last.end === null) last.end = Number(elapsed().toFixed(2));
  const total = beats.at(-1)?.end ?? 0;
  const capture = { base: BASE, video: final, seconds: total, beats, problems, capturedAt: new Date().toISOString() };
  await writeFile(path.join(OUT, 'capture.json'), JSON.stringify(capture, null, 2), 'utf8');
  console.log(JSON.stringify(capture, null, 2));
  if (problems.length) console.error(`\n${problems.length} console/page problem(s) during capture.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
