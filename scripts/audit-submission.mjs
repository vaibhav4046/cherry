#!/usr/bin/env node
/**
 * Cherry submission audit — Devpost preflight checks.
 * Prints PASS/FAIL/WARN lines; exits non-zero only when a FAIL occurred.
 * Node builtins only; run via `npm run audit:submission`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const CANONICAL_URL = 'https://cherry-wine.vercel.app';

let failures = 0;
let warnings = 0;

function pass(msg) { console.log(`PASS ${msg}`); }
function fail(msg) { failures += 1; console.log(`FAIL ${msg}`); }
function warn(msg) { warnings += 1; console.log(`WARN ${msg}`); }

function readText(relPath) {
  try {
    return readFileSync(join(ROOT, relPath), 'utf8');
  } catch {
    return null;
  }
}

// 1. Canonical URL in README + Devpost kit
for (const relPath of ['README.md', 'docs/release/DEVPOST_SUBMISSION.md']) {
  const text = readText(relPath);
  if (text === null) fail(`${relPath} is missing (needed for canonical URL check)`);
  else if (text.includes(CANONICAL_URL)) pass(`${relPath} contains ${CANONICAL_URL}`);
  else fail(`${relPath} does not contain ${CANONICAL_URL}`);
}

// 2. LICENSE exists and mentions MIT
{
  const text = readText('LICENSE');
  if (text === null) fail('LICENSE file is missing');
  else if (/MIT/.test(text)) pass('LICENSE exists and mentions MIT');
  else fail('LICENSE exists but does not mention MIT');
}

// 3. README setup instructions
{
  const text = readText('README.md') ?? '';
  const hasInstall = /npm (ci|install)/.test(text);
  const hasRun = /npm run dev|npm run build/.test(text);
  if (hasInstall && hasRun) pass('README has setup instructions (install + dev/build)');
  else fail(`README setup instructions incomplete (install: ${hasInstall}, dev/build: ${hasRun})`);
}

// 4. Release docs exist and are non-empty
for (const name of ['DEVPOST_SUBMISSION.md', 'DEMO_SCRIPT.md', 'CHERRY_COMPATIBILITY_MATRIX.md', 'CHERRY_RELEASE_EVIDENCE.md']) {
  const relPath = `docs/release/${name}`;
  const text = readText(relPath);
  if (text !== null && text.trim().length > 0) pass(`${relPath} exists and is non-empty`);
  else fail(`${relPath} is missing or empty`);
}

// 5. e2e-results.json parses
{
  const text = readText('docs/release/e2e-results.json');
  if (text === null) fail('docs/release/e2e-results.json is missing');
  else {
    try {
      const parsed = JSON.parse(text);
      const stats = parsed?.stats ?? {};
      pass(`docs/release/e2e-results.json parses (expected: ${stats.expected ?? '?'}, unexpected: ${stats.unexpected ?? '?'})`);
    } catch {
      fail('docs/release/e2e-results.json is not valid JSON');
    }
  }
}

// 6. sample-bundle.zip exists and is >1KB
{
  const relPath = 'docs/release/sample-bundle.zip';
  try {
    const size = statSync(join(ROOT, relPath)).size;
    if (size > 1024) pass(`${relPath} exists (${size} bytes)`);
    else fail(`${relPath} is suspiciously small (${size} bytes)`);
  } catch {
    fail(`${relPath} is missing`);
  }
}

// 7. Secret scan over tracked text files
{
  const SECRET_RE = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  // Known dummy fixture: runner redaction tests deliberately emit this string to
  // prove secret-shaped output is scrubbed (runner/runner.test.mjs, runner/v2.test.mjs).
  const ALLOWLISTED_FIXTURES = new Set(['sk-abcdefghijklmnop1234']);
  const SCAN_DIRS = ['src', 'scripts', 'docs', 'runner', 'schemas', 'e2e', 'tests'];
  const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'screenshots', 'test-results']);
  const TEXT_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.yaml', '.yml', '.svg']);
  const hits = [];

  function scanDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) scanDir(full);
        continue;
      }
      if (!TEXT_EXT.has(extname(entry.name).toLowerCase())) continue;
      let content;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const match = SECRET_RE.exec(content);
      if (match && !ALLOWLISTED_FIXTURES.has(match[1])) hits.push(`${full}: ${match[1].slice(0, 12)}…`);
    }
  }

  for (const dir of SCAN_DIRS) {
    if (existsSync(join(ROOT, dir))) scanDir(join(ROOT, dir));
  }
  if (hits.length === 0) pass('secret scan: no credential-shaped strings in tracked text files (redaction-test fixture allowlisted)');
  else for (const hit of hits) fail(`secret scan hit: ${hit}`);
}

// 8. Stale-claim scan over docs/release/*.md
{
  const releaseDir = join(ROOT, 'docs', 'release');
  const STALE_RE = /(live validated|fully offline)/i;
  let clean = true;
  for (const name of readdirSync(releaseDir)) {
    if (extname(name).toLowerCase() !== '.md') continue;
    const content = readFileSync(join(releaseDir, name), 'utf8');
    const match = STALE_RE.exec(content);
    if (match) {
      clean = false;
      warn(`stale claim "${match[1]}" in docs/release/${name}`);
    }
  }
  if (clean) pass('stale-claim scan: no "live validated" / "fully offline" in docs/release/*.md');
}

// 9. Demo route availability
{
  const appText = readText('src/app/App.tsx') ?? '';
  const landingText = readText('src/pages/Landing.tsx') ?? '';
  const hasRoute = appText.includes('"/studio"');
  const hasDemoLink = landingText.includes('/studio?demo=1');
  if (hasRoute && hasDemoLink) pass('demo route: /studio route exists and Landing links to /studio?demo=1');
  else fail(`demo route check failed (route: ${hasRoute}, landing link: ${hasDemoLink})`);
}

console.log(`\naudit-submission: ${failures} FAIL, ${warnings} WARN`);
process.exit(failures > 0 ? 1 : 0);
