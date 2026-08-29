#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/\/$/, '');
const checksumPath = join(rootPath, 'PACK_SHA256SUMS.txt');

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...await filesUnder(full));
    else out.push(full);
  }
  return out;
}

const expectedText = await readFile(checksumPath, 'utf8');
const expected = new Map(
  expectedText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
      if (!match) throw new Error(`Invalid checksum line: ${line}`);
      return [match[2], match[1].toLowerCase()];
    }),
);

const allFiles = (await filesUnder(rootPath))
  .map((full) => relative(rootPath, full).split(sep).join('/'))
  .filter((path) => path !== 'PACK_SHA256SUMS.txt');

const failures = [];
for (const path of allFiles) {
  if (!expected.has(path)) failures.push(`Missing checksum entry: ${path}`);
}
for (const path of expected.keys()) {
  if (!allFiles.includes(path)) failures.push(`Checksum references missing file: ${path}`);
}
for (const path of allFiles) {
  const digest = createHash('sha256').update(await readFile(join(rootPath, path))).digest('hex');
  if (expected.get(path) !== digest) failures.push(`Checksum mismatch: ${path}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Cherry execution pack verified: ${allFiles.length} files, all SHA-256 checksums match.`);
