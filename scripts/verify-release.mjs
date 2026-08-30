#!/usr/bin/env node
// Release pack gate: proves the shipped sample bundle is genuine and tamper-evident.
// 1. sample-bundle.zip hash matches sample-bundle.meta.json
// 2. the bundle's own standalone verifier passes on the pristine extraction
// 3. a one-byte mutation of a listed file makes verification FAIL
// 4. deleting an evidence file makes verification FAIL
// Exits non-zero if any expectation is violated.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = join(repoRoot, 'docs', 'release', 'sample-bundle.zip');
const metaPath = join(repoRoot, 'docs', 'release', 'sample-bundle.meta.json');

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const zipBytes = readFileSync(zipPath);
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

// 1. Zip integrity against recorded metadata.
const zipHash = createHash('sha256').update(zipBytes).digest('hex');
check(zipHash === meta.sha256, 'sample-bundle.zip sha256 matches sample-bundle.meta.json', zipHash.slice(0, 12));

// Extract (with path-traversal guard).
const workDir = mkdtempSync(join(tmpdir(), 'cherry-verify-'));
const zip = await JSZip.loadAsync(zipBytes);
for (const [name, entry] of Object.entries(zip.files)) {
  const target = resolve(workDir, name);
  if (!(target + sep).startsWith(workDir + sep) && target !== workDir) {
    throw new Error(`Refusing zip entry outside extraction root: ${name}`);
  }
  if (entry.dir) {
    mkdirSync(target, { recursive: true });
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, await entry.async('nodebuffer'));
  }
}
const bundleDirName = Object.keys(zip.files)[0].split('/')[0];
const bundleDir = join(workDir, bundleDirName);
const verifier = join(bundleDir, 'scripts', 'verify.mjs');
check(existsSync(verifier), 'bundle ships a standalone verifier (scripts/verify.mjs)');

// 2. Every file recorded in metadata exists in the extraction.
const missing = meta.files.filter((f) => !existsSync(join(bundleDir, f)));
check(missing.length === 0, 'all files listed in meta exist in bundle', missing.join(', ') || `${meta.files.length} files`);

function runVerifier() {
  return spawnSync(process.execPath, [verifier], { cwd: bundleDir, encoding: 'utf8' });
}

// 3. Pristine bundle verifies.
const pristine = runVerifier();
check(pristine.status === 0, 'pristine bundle passes its own verifier', `exit ${pristine.status}`);
if (pristine.status !== 0) console.error(pristine.stdout + pristine.stderr);

// 4. One-byte mutation must fail.
const victim = join(bundleDir, 'SKILL.md');
const original = readFileSync(victim);
const mutated = Buffer.from(original);
mutated[0] = mutated[0] ^ 0x01;
writeFileSync(victim, mutated);
const tampered = runVerifier();
check(tampered.status !== 0, 'one-byte mutation of SKILL.md fails verification', `exit ${tampered.status}`);
writeFileSync(victim, original);

// 5. Missing evidence must fail.
const evidence = join(bundleDir, 'references', 'evidence.md');
const evidenceBytes = readFileSync(evidence);
unlinkSync(evidence);
const gutted = runVerifier();
check(gutted.status !== 0, 'deleting references/evidence.md fails verification', `exit ${gutted.status}`);
writeFileSync(evidence, evidenceBytes);

rmSync(workDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} release-pack check(s) failed`);
  process.exit(1);
}
console.log('\nRelease pack verified: bundle genuine, tamper-evident, evidence-complete.');
