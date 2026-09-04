#!/usr/bin/env node
/**
 * Presents a raw screen capture the way a product film presents one.
 *
 * The capture itself is untouched footage of the real deployment. This only
 * changes how it is framed: the recording is floated as a rounded window with a
 * soft shadow over a blurred, darkened copy of itself, and each beat gets a
 * lower-third caption — a small letterspaced kicker over a large headline.
 *
 * Captions are PNGs rendered from HTML rather than drawn by ffmpeg, because
 * letterspacing and real font weights are the difference between this and a
 * subtitle burn.
 *
 * Usage:
 *   node scripts/cinema-demo.mjs --in <dir with capture.json + <name>.webm> \
 *     --captions <captions.json> --out <file.mp4>
 */
import { chromium } from '@playwright/test';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const IN = flag('in', null);
const SOURCE = flag('source', null);
const CAPTIONS = flag('captions', null);
const OUT = flag('out', null);
if (!IN || !CAPTIONS || !OUT) {
  console.error('need --in, --captions and --out');
  process.exit(1);
}

const W = 1920;
const H = 1080;
const WIN_W = 1512;
const WIN_H = Math.round((WIN_W * 720) / 1280); // 851, the capture's own aspect
const WIN_X = Math.round((W - WIN_W) / 2);
const WIN_Y = 96;
const RADIUS = 16;

const ASSETS = path.join(IN, 'cinema');

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** White rounded rectangle on black: the alpha channel for the floated window. */
const maskHtml = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;width:${WIN_W}px;height:${WIN_H}px;overflow:hidden}
  .r{width:${WIN_W}px;height:${WIN_H}px;background:#fff;border-radius:${RADIUS}px}
</style><div class="r"></div>`;

/** The shadow sits under the window, so it is drawn before the window is laid on top. */
const shadowHtml = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
  .s{position:absolute;left:${WIN_X}px;top:${WIN_Y}px;width:${WIN_W}px;height:${WIN_H}px;
     border-radius:${RADIUS}px;background:#000;
     box-shadow:0 40px 90px rgba(0,0,0,.55), 0 12px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.10)}
</style><div class="s"></div>`;

function captionHtml(kicker, headline) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
    .scrim{position:absolute;left:0;right:0;bottom:0;height:340px;
       background:linear-gradient(to top, rgba(10,3,5,.92) 0%, rgba(10,3,5,.72) 38%, rgba(10,3,5,0) 100%)}
    .wrap{position:absolute;left:0;right:0;bottom:74px;text-align:center;font-family:${FONT}}
    .k{font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:#e6b9c6;
       margin:0 0 14px;font-weight:600;text-shadow:0 2px 14px rgba(0,0,0,.75)}
    .h{font-size:52px;line-height:1.12;color:#fff;margin:0;font-weight:600;letter-spacing:-.015em;
       text-shadow:0 3px 26px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.6)}
  </style><div class="scrim"></div><div class="wrap"><p class="k">${kicker}</p><p class="h">${headline}</p></div>`;
}

async function renderPngs(captions) {
  await rm(ASSETS, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  await page.setViewportSize({ width: WIN_W, height: WIN_H });
  await page.setContent(maskHtml);
  await page.screenshot({ path: path.join(ASSETS, 'mask.png') });

  await page.setViewportSize({ width: W, height: H });
  await page.setContent(shadowHtml);
  await page.screenshot({ path: path.join(ASSETS, 'shadow.png'), omitBackground: true });

  const files = [];
  for (const [i, caption] of captions.entries()) {
    await page.setContent(captionHtml(caption.kicker, caption.headline));
    const file = path.join(ASSETS, `cap-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: file, omitBackground: true });
    files.push(file);
  }
  await browser.close();
  return files;
}

async function main() {
  const capture = JSON.parse(await readFile(path.join(IN, 'capture.json'), 'utf8'));
  const captions = JSON.parse(await readFile(CAPTIONS, 'utf8'));
  const beats = capture.beats;
  if (captions.length !== beats.length) {
    throw new Error(`${beats.length} beats but ${captions.length} captions`);
  }
  const source = SOURCE ?? capture.video;
  const capFiles = await renderPngs(captions);

  const videoSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source], { encoding: 'utf8' }).trim());

  // Inputs: 0 = capture, 1 = mask, 2 = shadow, 3.. = captions.
  const inputs = ['-i', source, '-loop', '1', '-i', path.join(ASSETS, 'mask.png'), '-loop', '1', '-i', path.join(ASSETS, 'shadow.png')];
  // A full-bleed card already carries its own headline, so it is not captioned.
  const captioned = beats.map((beat, i) => ({ beat, file: capFiles[i] })).filter(({ beat }) => !beat.card);
  captioned.forEach(({ file }) => inputs.push('-loop', '1', '-i', file));

  const chain = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=36,eq=brightness=-0.42:saturation=0.55[bg]`,
    `[0:v]scale=${WIN_W}:${WIN_H}:flags=lanczos,format=rgba[fg]`,
    `[1:v]format=gray,scale=${WIN_W}:${WIN_H}[mk]`,
    `[fg][mk]alphamerge[fgm]`,
    `[bg][2:v]overlay=0:0:format=auto[withshadow]`,
    `[withshadow][fgm]overlay=${WIN_X}:${WIN_Y}:format=auto[base0]`,
  ];
  captioned.forEach(({ beat }, i) => {
    // A caption holds its beat, minus a breath at each end so it does not
    // change in the same frame the picture does.
    const start = (beat.start + 0.35).toFixed(2);
    const end = Math.min(beat.end - 0.2, videoSeconds).toFixed(2);
    chain.push(`[base${i}][${i + 3}:v]overlay=0:0:format=auto:enable='between(t,${start},${end})'[base${i + 1}]`);
  });
  const finalLabel = `base${captioned.length}`;

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', chain.join(';'),
    '-map', `[${finalLabel}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30',
    '-movflags', '+faststart',
    '-t', String(videoSeconds),
    OUT,
  ], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });

  console.log(JSON.stringify({
    source,
    out: OUT,
    seconds: +videoSeconds.toFixed(2),
    captions: captions.length,
    captioned: captioned.length,
    window: { w: WIN_W, h: WIN_H, x: WIN_X, y: WIN_Y, radius: RADIUS },
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
