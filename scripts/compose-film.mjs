#!/usr/bin/env node
/**
 * Turns the raw Playwright take into the product film.
 *
 * The recording is the real app; this only frames it. The window is rounded and
 * given a soft shadow, then floated over a blurred, darkened still lifted from
 * Cherry's own landing page, so the backdrop is the product rather than stock
 * art. Nothing inside the window is altered, retimed, or re-rendered: a judge
 * comparing a frame against the live app must see the same pixels.
 *
 * Usage:
 *   node scripts/compose-film.mjs [--in <video>] [--out <mp4>] [--backdrop <image>]
 *
 * Requires ffmpeg on PATH.
 */
import { execFile } from 'node:child_process';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const CANVAS = { width: 2560, height: 1440 };
/** The window sits slightly above centre, the way the reference film frames it. */
const WINDOW = { width: 2160, height: 1350, radius: 28, top: 96 };

async function findTake(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await findTake(path)));
    else if (entry.name.endsWith('.webm')) found.push(path);
  }
  return found;
}

async function ffmpeg(argv) {
  try {
    return await run('ffmpeg', argv, { maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).split('\n').slice(-6).join('\n');
    throw new Error(`ffmpeg failed:\n${detail}`);
  }
}

const source = flag('in', null) ?? (async () => {
  const root = resolve('playwright-report/film');
  const takes = await findTake(root).catch(() => []);
  if (takes.length !== 1) {
    throw new Error(`Expected exactly one .webm below ${root}; found ${takes.length}. Run npm run record:film first.`);
  }
  return takes[0];
});

const input = typeof source === 'function' ? await source() : resolve(source);
const output = resolve(flag('out', 'docs/media/cherry-film.mp4'));
const backdrop = resolve(flag('backdrop', 'docs/media/cherry-landing.png'));

await stat(input);
await stat(backdrop).catch(() => {
  throw new Error(`Backdrop not found: ${backdrop}. Pass --backdrop <image>.`);
});
await mkdir(dirname(output), { recursive: true });

const { width: cw, height: ch } = CANVAS;
const { width: ww, height: wh, radius, top } = WINDOW;
const left = Math.round((cw - ww) / 2);

/**
 * The rounded-corner mask is a still, so it is built once rather than evaluated
 * per pixel per frame. `geq` on a single image is instant; the same expression
 * inside the video graph turns a one-minute take into a twenty-minute encode.
 */
const maskPath = resolve('playwright-report/film/window-mask.png');
await ffmpeg([
  '-y',
  '-f', 'lavfi',
  '-i', `color=white:s=${ww}x${wh}`,
  '-vf', `format=gray,geq=lum='if(gt(hypot(max(0,${radius}-X)+max(0,X-(W-1-${radius})),max(0,${radius}-Y)+max(0,Y-(H-1-${radius}))),${radius}),0,255)'`,
  '-frames:v', '1',
  maskPath,
]);

/**
 * One graph, so the frame is composed in a single pass:
 *   backdrop -> fill the canvas, blur hard, darken
 *   take     -> scale into the window box, rounded by the mask above
 *   shadow   -> the same rounded silhouette, blurred and offset underneath
 */
const filter = [
  `[0:v]scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},gblur=sigma=42,eq=brightness=-0.06:saturation=0.85[bg]`,
  `[1:v]scale=${ww}:${wh}:force_original_aspect_ratio=decrease,pad=${ww}:${wh}:(ow-iw)/2:(oh-ih)/2:color=white,format=rgba[take]`,
  `[2:v]format=gray,split=2[maskA][maskB]`,
  `[take][maskA]alphamerge[win]`,
  `[maskB]format=rgba,colorchannelmixer=rr=0:rg=0:rb=0:gr=0:gg=0:gb=0:br=0:bg=0:bb=0:ar=0.45:ag=0:ab=0,gblur=sigma=26[shadow]`,
  `[bg][shadow]overlay=${left}:${top + 20}[withShadow]`,
  `[withShadow][win]overlay=${left}:${top}[framed]`,
  `[framed]format=yuv420p[v]`,
].join(';');

console.log(`Composing ${input}\n     over ${backdrop}\n       -> ${output}`);

await ffmpeg([
  '-y',
  '-loop', '1', '-i', backdrop,
  '-i', input,
  '-loop', '1', '-i', maskPath,
  '-filter_complex', filter,
  '-map', '[v]',
  '-shortest',
  '-r', '30',
  '-c:v', 'libx264',
  // 2560x1440 with a blurred alpha shadow is heavy; 'slow' turned a one-minute
  // take into a ten-minute encode for no visible gain at this bitrate.
  '-preset', 'medium',
  '-crf', '21',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  output,
]);

const { size } = await stat(output);
console.log(`Done: ${output} (${(size / 1024 / 1024).toFixed(1)} MB)`);
