#!/usr/bin/env node
/**
 * Judge-surface audit for the OpenAI WebMCP Challenge submission.
 *
 * Cherry keeps compatibility readers for older exported bundles, but the live
 * product and canonical submission material must present one coherent story:
 * Codex execution, WebMCP site tools, MCP, and portable Agent Skills.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const TEXT_EXTENSIONS = new Set(['.html', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml']);
const REQUIRED_FILES = [
  'README.md',
  'AGENTS.md',
  'index.html',
  'docs/release/SUBMISSION.md',
  'docs/release/DEVPOST_SUBMISSION.md',
  'docs/release/CODEX_WEBMCP_SUBMISSION.md',
  'src/app/RouteMeta.tsx',
  'src/cherry/webmcp/tool-definitions.ts',
  'src/cherry/workforce/capability-registry-service.ts',
  'src/cherry/workforce/mission-control-service.ts',
  'src/components/GuidedTour.tsx',
  'src/components/marketing/landing-content.ts',
  'src/pages/Compatibility.tsx',
  'src/pages/Connect.tsx',
  'src/pages/ShowcaseLearn.tsx',
  'src/pages/studio/Connections.tsx',
  'src/pages/studio/SkillDetail.tsx',
  'src/pages/studio/Skills.tsx',
];
const REQUIRED_DIRECTORIES = ['src/app', 'src/components', 'src/pages'];
const forbiddenNames = [
  ['Cl', 'aude'].join(''),
  ['Anth', 'ropic'].join(''),
  ['O', 'pus'].join(''),
];
const forbiddenPattern = new RegExp(`\\b(?:${forbiddenNames.join('|')})\\b`, 'i');

let failures = 0;
function pass(message) { console.log(`PASS ${message}`); }
function fail(message) { failures += 1; console.log(`FAIL ${message}`); }

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function listTextFiles(relativeDirectory) {
  const absoluteDirectory = join(ROOT, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];
  const results = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolute = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTextFiles(relative(ROOT, absolute)));
    } else if (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(relative(ROOT, absolute));
    }
  }
  return results;
}

const surfaceFiles = new Set(REQUIRED_FILES);
for (const directory of REQUIRED_DIRECTORIES) {
  for (const file of listTextFiles(directory)) surfaceFiles.add(file);
}

const missing = [...surfaceFiles].filter((file) => !existsSync(join(ROOT, file)));
if (missing.length > 0) {
  for (const file of missing) fail(`judge-facing file is missing: ${file}`);
}

const vendorHits = [];
for (const file of [...surfaceFiles].sort()) {
  const absolute = join(ROOT, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = forbiddenPattern.exec(line);
    if (match) vendorHits.push(`${file}:${index + 1}: ${match[0]}`);
  });
}
if (vendorHits.length === 0) {
  pass('judge-facing application and canonical docs are vendor-neutral');
} else {
  for (const hit of vendorHits) fail(`competing-vendor reference on judge surface: ${hit}`);
}

const readme = existsSync(join(ROOT, 'README.md')) ? read('README.md') : '';
const submission = existsSync(join(ROOT, 'docs/release/CODEX_WEBMCP_SUBMISSION.md'))
  ? read('docs/release/CODEX_WEBMCP_SUBMISSION.md')
  : '';
const hourly = existsSync(join(ROOT, '.github/workflows/hourly-health.yml'))
  ? read('.github/workflows/hourly-health.yml')
  : '';
const verifyWorkflow = existsSync(join(ROOT, '.github/workflows/verify.yml'))
  ? read('.github/workflows/verify.yml')
  : '';
const packageJson = existsSync(join(ROOT, 'package.json')) ? read('package.json') : '';

const anchors = [
  ['README names Codex', /\bCodex\b/.test(readme)],
  ['README names the OpenAI WebMCP Challenge 2026', readme.includes('OpenAI WebMCP Challenge 2026')],
  ['README exposes the live app', readme.includes('https://cherry-wine.vercel.app')],
  ['README exposes the judge route', readme.includes('https://cherry-wine.vercel.app/showcase')],
  ['canonical brief explains document.modelContext', submission.includes('document.modelContext')],
  ['canonical brief names Codex', /\bCodex\b/.test(submission)],
  ['canonical brief names the live judge route', submission.includes('https://cherry-wine.vercel.app/showcase')],
  ['hourly workflow has an hourly cron', /cron:\s*['"]17 \* \* \* \*['"]/.test(hourly)],
  ['hourly workflow runs the deterministic gates', hourly.includes('npm run gates')],
  ['hourly workflow runs focused WebMCP journeys', hourly.includes('webmcp-god-mode.spec.ts')],
  ['verify workflow runs the Codex submission audit', verifyWorkflow.includes('npm run audit:codex-submission')],
  ['package exposes the Codex submission audit', packageJson.includes('"audit:codex-submission"')],
];
const failedAnchors = anchors.filter(([, ok]) => !ok);
if (failedAnchors.length === 0) {
  pass('Codex, WebMCP, judge-route and hourly-monitor anchors are present');
} else {
  for (const [label] of failedAnchors) fail(label);
}

console.log(`\naudit-codex-submission: ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
