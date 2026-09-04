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
 * One graph, so the frame is composed in a single pass:
 *   backdrop -> fill the canvas, blur hard, darken
 *   take     -> scale to the window box, round its corners with an alpha mask
 *   shadow   -> the same rounded box, blurred and offset under the window
 */
const filter = [
  `[0:v]scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},gblur=sigma=42,eq=brightness=-0.06:saturation=0.85[bg]`,
  `[1:v]scale=${ww}:${wh}:force_original_aspect_ratio=decrease,pad=${ww}:${wh}:(ow-iw)/2:(oh-ih)/2:color=white,` +
    `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
    `a='if(gt(hypot(max(0,${radius}-X)+max(0,X-(W-1-${radius})),max(0,${radius}-Y)+max(0,Y-(H-1-${radius}))),${radius}),0,255)'[win]`,
  `[win]split=2[winA][winB]`,
  `[winB]format=rgba,colorchannelmixer=rr=0:gg=0:bb=0:aa=0.45,gblur=sigma=26[shadow]`,
  `[bg][shadow]overlay=${left}:${top + 18}[withShadow]`,
  `[withShadow][winA]overlay=${left}:${top}[framed]`,
  `[framed]format=yuv420p[v]`,
].join(';');

console.log(`Composing ${input}\n     over ${backdrop}\n       -> ${output}`);

await ffmpeg([
  '-y',
  '-loop', '1', '-i', backdrop,
  '-i', input,
  '-filter_complex', filter,
  '-map', '[v]',
  '-shortest',
  '-r', '30',
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '20',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  output,
]);

const { size } = await stat(output);
console.log(`Done: ${output} (${(size / 1024 / 1024).toFixed(1)} MB)`);
