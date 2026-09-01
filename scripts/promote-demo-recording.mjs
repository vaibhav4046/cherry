import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const sourceRoot = resolve('playwright-report/demo-recording');
const destination = resolve('public/media/demo/golden-loop.webm');
const maximumBytes = 12 * 1024 * 1024;

async function findVideos(directory) {
  const videos = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) videos.push(...await findVideos(path));
    if (entry.isFile() && entry.name === 'video.webm') videos.push(path);
  }
  return videos;
}

const videos = await findVideos(sourceRoot);
if (videos.length !== 1) {
  throw new Error(`Expected one Playwright video below ${sourceRoot}; found ${videos.length}.`);
}

const source = videos[0];
const metadata = await stat(source);
if (metadata.size > maximumBytes) {
  throw new Error(`Recording is ${metadata.size} bytes; compress it below ${maximumBytes} bytes before publishing.`);
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`Promoted ${metadata.size} byte recording to ${destination}`);
