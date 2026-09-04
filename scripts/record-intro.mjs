#!/usr/bin/env node
/**
 * The opening of the film: mark, idea, architecture, repository.
 *
 * The motion is real CSS animation recorded in a real browser, not a stack of
 * stills — the same way the rest of the film is recorded, so the two halves
 * cut together without a seam. The repository shot is the actual public repo,
 * loaded live.
 *
 * Usage: node scripts/record-intro.mjs [--out <dir>] [--repo <url>]
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const OUT = flag('out', 'work/intro');
const REPO = flag('repo', 'https://github.com/vaibhav4046/cherry');

const beats = [];
let t0 = 0;
const elapsed = () => (t0 ? Number(((Date.now() - t0) / 1000).toFixed(2)) : 0);
function beat(label, card = true) {
  const previous = beats.at(-1);
  if (previous) previous.end = elapsed();
  beats.push({ start: elapsed(), end: null, label, card });
}

const SHELL = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:#120508; overflow:hidden;
    font-family:"Segoe UI", system-ui, -apple-system, sans-serif; color:#fdf6f2; }
  .stage { position:absolute; inset:0; display:grid; place-items:center; }
  .grain { position:absolute; inset:0; pointer-events:none; opacity:.35;
    background:radial-gradient(1200px 600px at 50% 20%, rgba(143,29,47,.28), transparent 70%); }
  @keyframes rise { from { opacity:0; transform:translateY(18px);} to { opacity:1; transform:none;} }
  @keyframes fade { from { opacity:0 } to { opacity:1 } }
  @keyframes pop {
    0%   { opacity:0; transform:scale(.72) translateY(26px); }
    58%  { opacity:1; transform:scale(1.06) translateY(-6px); }
    78%  { transform:scale(.985) translateY(2px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes draw { to { stroke-dashoffset:0; } }
  @keyframes sweep { from { transform:scaleX(0) } to { transform:scaleX(1) } }
  @keyframes drift { from { transform:translateY(0) } to { transform:translateY(-8px) } }
`;

/** The mark: the cherry pair, drawn, then the wordmark under it. */
const sceneLogo = `<div class="stage"><div class="grain"></div>
  <div style="text-align:center">
    <svg width="230" height="230" viewBox="0 0 120 120" aria-hidden="true"
         style="animation:pop 1100ms cubic-bezier(.16,1,.3,1) both">
      <path d="M62 20 C56 40, 40 52, 32 66" fill="none" stroke="#7d9b62" stroke-width="3.4"
            stroke-linecap="round" stroke-dasharray="90" stroke-dashoffset="90"
            style="animation:draw 700ms 260ms ease-out forwards"/>
      <path d="M62 20 C70 38, 82 50, 88 64" fill="none" stroke="#7d9b62" stroke-width="3.4"
            stroke-linecap="round" stroke-dasharray="90" stroke-dashoffset="90"
            style="animation:draw 700ms 360ms ease-out forwards"/>
      <path d="M62 21 C74 12, 90 14, 96 24 C86 30, 70 30, 62 21 Z" fill="#7d9b62"
            style="animation:fade 420ms 620ms both"/>
      <circle cx="30" cy="80" r="15.5" fill="#8f1d2f" style="animation:pop 620ms 520ms cubic-bezier(.16,1,.3,1) both"/>
      <circle cx="90" cy="78" r="15.5" fill="#a92a3c" style="animation:pop 620ms 640ms cubic-bezier(.16,1,.3,1) both"/>
      <circle cx="25" cy="75" r="4.4" fill="rgba(255,255,255,.30)" style="animation:fade 400ms 900ms both"/>
      <circle cx="85" cy="73" r="4.4" fill="rgba(255,255,255,.26)" style="animation:fade 400ms 980ms both"/>
    </svg>
    <div style="font-size:82px;font-weight:600;letter-spacing:-.03em;margin-top:14px;
                animation:rise 760ms 820ms cubic-bezier(.16,1,.3,1) both">Cherry</div>
    <div style="height:2px;width:120px;background:#8f1d2f;margin:26px auto 0;transform-origin:left;
                animation:sweep 620ms 1250ms cubic-bezier(.16,1,.3,1) both"></div>
    <div style="font-size:19px;letter-spacing:.30em;text-transform:uppercase;color:#c9899a;margin-top:24px;
                animation:fade 700ms 1500ms both">Supervised work on your computer</div>
  </div></div>`;

/** The idea, stated as the metaphor it is. */
const sceneIdea = `<div class="stage"><div class="grain"></div>
  <div style="width:1080px">
    <p style="font-size:19px;letter-spacing:.30em;text-transform:uppercase;color:#c9899a;margin:0 0 22px;
              animation:fade 600ms both">Where the name comes from</p>
    <h1 style="font-size:60px;line-height:1.1;margin:0;font-weight:600;letter-spacing:-.02em;
               animation:rise 800ms 200ms cubic-bezier(.16,1,.3,1) both">
      A cherry is small enough to pick up whole.</h1>
    <p style="font-size:25px;line-height:1.5;color:#d9bfc6;margin:26px 0 0;max-width:880px;
              animation:rise 800ms 620ms cubic-bezier(.16,1,.3,1) both">
      And it leaves you a stone you can plant. That is what a skill is here: one
      small, finished thing you can hand to any agent — and the seed of the next one.</p>
  </div></div>`;

/** The architecture, drawn as it is described. */
const box = (x, y, w, h, label, sub, delay, accent) => `
  <g style="animation:rise 620ms ${delay}ms cubic-bezier(.16,1,.3,1) both">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${accent ? 'rgba(143,29,47,.20)' : 'rgba(255,255,255,.045)'}"
          stroke="${accent ? '#a92a3c' : 'rgba(255,255,255,.20)'}" stroke-width="1.2"/>
    <text x="${x + w / 2}" y="${y + (sub ? h / 2 - 6 : h / 2 + 6)}" text-anchor="middle"
          fill="#fdf6f2" font-size="19" font-weight="600" font-family="Segoe UI, sans-serif">${label}</text>
    ${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 20}" text-anchor="middle" fill="#c9899a" font-size="14"
          font-family="Segoe UI, sans-serif">${sub}</text>` : ''}
  </g>`;
const link = (x1, y1, x2, y2, delay) => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,.30)" stroke-width="1.4"
        stroke-dasharray="${Math.hypot(x2 - x1, y2 - y1).toFixed(0)}"
        stroke-dashoffset="${Math.hypot(x2 - x1, y2 - y1).toFixed(0)}"
        style="animation:draw 520ms ${delay}ms ease-out forwards"/>`;

const sceneArchitecture = `<div class="stage"><div class="grain"></div>
  <div style="width:1180px">
    <p style="font-size:19px;letter-spacing:.30em;text-transform:uppercase;color:#c9899a;margin:0 0 6px;
              animation:fade 500ms both">The harness</p>
    <h1 style="font-size:38px;margin:0 0 14px;font-weight:600;letter-spacing:-.02em;
               animation:rise 700ms 160ms cubic-bezier(.16,1,.3,1) both">
      One page. Three ways in. One authority boundary.</h1>
    <svg width="1180" height="440" viewBox="0 0 1500 560">
      ${box(60, 40, 300, 86, 'A WebMCP host', 'ChatGPT desktop, Work mode', 300, true)}
      ${box(60, 180, 300, 86, 'An MCP client', 'stdio bridge, read + verify', 420)}
      ${box(60, 320, 300, 86, 'A person', 'the same screens, by hand', 540)}
      ${link(360, 83, 520, 210, 700)}
      ${link(360, 223, 520, 223, 760)}
      ${link(360, 363, 520, 240, 820)}
      ${box(520, 150, 330, 150, 'Cherry, in the browser', 'state-aware aperture', 900, true)}
      ${link(850, 200, 1000, 140, 1100)}
      ${link(850, 250, 1000, 330, 1160)}
      ${box(1000, 96, 440, 90, 'IndexedDB', 'local-first, offline, exportable', 1240)}
      ${box(1000, 286, 440, 90, 'Zero-dependency runner', 'leases, queue, hash-chained events', 1320)}
      ${box(520, 400, 330, 96, 'Human approval', 'no tool reaches this', 1440, true)}
      ${link(685, 300, 685, 400, 1400)}
    </svg>
  </div></div>`;

const sceneRepoFallback = `<div class="stage"><div class="grain"></div>
  <div style="width:1080px;text-align:center">
    <p style="font-size:19px;letter-spacing:.30em;text-transform:uppercase;color:#c9899a;margin:0 0 22px;
              animation:fade 600ms both">Open source, MIT</p>
    <h1 style="font-size:56px;line-height:1.1;margin:0;font-weight:600;letter-spacing:-.02em;
               animation:rise 800ms 200ms cubic-bezier(.16,1,.3,1) both">github.com/vaibhav4046/cherry</h1>
    <p style="font-size:23px;color:#d9bfc6;margin:26px 0 0;animation:rise 800ms 560ms cubic-bezier(.16,1,.3,1) both">
      Every gate in the README runs in CI on every push.</p>
  </div></div>`;

function page(scene) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><style>${SHELL}</style>${scene}`)}`;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  t0 = Date.now();
  const page_ = await context.newPage();
  page_.setDefaultTimeout(120_000);
  page_.setDefaultNavigationTimeout(120_000);

  await page_.goto(page(sceneLogo));
  beat('Logo: the mark draws itself');
  await page_.waitForTimeout(5200);

  await page_.goto(page(sceneIdea));
  beat('The idea behind the name');
  await page_.waitForTimeout(6400);

  await page_.goto(page(sceneArchitecture));
  beat('The harness, drawn as it is described');
  await page_.waitForTimeout(8200);

  // The real repository, loaded live. If it will not load, the film says the
  // URL rather than faking a screenshot of it.
  let repoLoaded = false;
  try {
    await page_.goto(REPO, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page_.waitForTimeout(2000);
    repoLoaded = true;
  } catch {
    await page_.goto(page(sceneRepoFallback));
  }
  beat('The public repository, MIT', !repoLoaded);
  await page_.waitForTimeout(4400);
  if (repoLoaded) {
    await page_.evaluate(() => globalThis.scrollTo({ top: 1850, behavior: 'smooth' }));
    await page_.waitForTimeout(1200);
  }
  beat('The README, and the gates it publishes', !repoLoaded);
  await page_.waitForTimeout(4200);

  await page_.close();
  await context.close();
  await browser.close();

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.webm'));
  let video = null;
  if (files.length === 1) {
    video = path.join(OUT, 'cherry-intro.webm');
    await rename(path.join(OUT, files[0]), video);
  }
  const last = beats.at(-1);
  if (last && last.end === null) last.end = elapsed();
  const capture = { video, seconds: last?.end ?? 0, beats, capturedAt: new Date().toISOString() };
  await writeFile(path.join(OUT, 'capture.json'), JSON.stringify(capture, null, 2), 'utf8');
  console.log(JSON.stringify(capture, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
