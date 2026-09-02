import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildRecordedMissionFixture,
  verifyRecordedMissionFixture,
} from '../src/components/showcase/recorded-mission.mjs';

const DEFAULT_SOURCE = resolve('docs/release/benchmarks/god-mode-hosts.json');
const DEFAULT_REPLAY = resolve('public/media/cherry-demo/recorded-mission.json');
const DEFAULT_VIDEO = resolve('public/media/cherry-demo/mission-hero.webm');
const MAXIMUM_VIDEO_BYTES = 6 * 1024 * 1024;
const CAPTURE_DURATION_MS = 27_000;

async function replaceAtomically(outputPath, bytes) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.next`;
  await writeFile(temporaryPath, bytes, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writePublicReplay(sourcePath = DEFAULT_SOURCE, outputPath = DEFAULT_REPLAY) {
  const captureText = await readFile(sourcePath, 'utf8');
  const replay = await buildRecordedMissionFixture(captureText);
  if (!(await verifyRecordedMissionFixture(replay))) {
    throw new Error('Refusing to write an unverified recorded mission replay.');
  }
  const bytes = `${JSON.stringify(replay, null, 2)}\n`;
  await replaceAtomically(outputPath, bytes);
  return {
    outputPath,
    bytes: Buffer.byteLength(bytes),
    verified: true,
  };
}

export async function inspectWebm(videoPath) {
  const bytes = await readFile(videoPath);
  const metadata = await stat(videoPath);
  const magic = bytes.subarray(0, 4).toString('hex');
  if (magic !== '1a45dfa3') throw new Error('Captured media is not a WebM container.');
  if (metadata.size === 0 || metadata.size > MAXIMUM_VIDEO_BYTES) {
    throw new Error(`Captured media must be 1-${MAXIMUM_VIDEO_BYTES} bytes; received ${metadata.size}.`);
  }
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  let playback;
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(videoPath)).href);
    playback = await page.locator('video').evaluate(async (element) => {
      // HAVE_METADATA is 1; keeping the numeric threshold avoids leaking a
      // browser global into this Node-owned capture script's lint environment.
      if (element.readyState < 1) {
        await new Promise((resolveMetadata, rejectMetadata) => {
          element.addEventListener('loadedmetadata', resolveMetadata, { once: true });
          element.addEventListener('error', rejectMetadata, { once: true });
        });
      }
      return {
        durationMs: Math.round(element.duration * 1_000),
        width: element.videoWidth,
        height: element.videoHeight,
      };
    });
  } finally {
    await browser.close();
  }
  if (playback.width !== 1440 || playback.height !== 900) {
    throw new Error(`Captured media must be 1440x900; received ${playback.width}x${playback.height}.`);
  }
  if (playback.durationMs < 20_000 || playback.durationMs > 35_000) {
    throw new Error(`Captured media must be 20-35 seconds; received ${playback.durationMs}ms.`);
  }
  return {
    path: videoPath,
    bytes: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...playback,
    container: 'webm',
  };
}

export async function captureHeroLoop({
  baseUrl = 'http://127.0.0.1:4173',
  outputPath = DEFAULT_VIDEO,
} = {}) {
  const { chromium } = await import('@playwright/test');
  const captureDirectory = await mkdtemp(join(tmpdir(), 'cherry-winner-capture-'));
  const browser = await chromium.launch();
  let videoPath;
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: captureDirectory, size: { width: 1440, height: 900 } },
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const video = page.video();
    await page.goto(`${baseUrl}/showcase?capture=hero`, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="mission-capture-ready"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(CAPTURE_DURATION_MS);
    await context.close();
    videoPath = await video.path();
  } finally {
    await browser.close();
  }

  if (!videoPath) throw new Error('Playwright did not produce a browser-session recording.');
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(videoPath, outputPath);
  const result = await inspectWebm(outputPath);
  await rm(captureDirectory, { recursive: true, force: true });
  return result;
}

function parseArguments(argv) {
  const options = {
    sourcePath: DEFAULT_SOURCE,
    replayPath: DEFAULT_REPLAY,
    videoPath: DEFAULT_VIDEO,
    baseUrl: 'http://127.0.0.1:4173',
    capture: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--capture') options.capture = true;
    else if (argument === '--source') options.sourcePath = resolve(argv[++index]);
    else if (argument === '--replay-output') options.replayPath = resolve(argv[++index]);
    else if (argument === '--video-output') options.videoPath = resolve(argv[++index]);
    else if (argument === '--base-url') options.baseUrl = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const replay = await writePublicReplay(options.sourcePath, options.replayPath);
  console.log(`Recorded replay: ${replay.bytes} bytes, integrity verified, ${replay.outputPath}`);
  if (options.capture) {
    const video = await captureHeroLoop({ baseUrl: options.baseUrl, outputPath: options.videoPath });
    console.log(`Hero recording: ${video.bytes} bytes, ${video.width}x${video.height}, ${video.durationMs}ms, sha256 ${video.sha256}`);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
