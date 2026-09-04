#!/usr/bin/env node
/**
 * Validate and apply the structured patch returned by the hourly Codex job.
 *
 * This script is part of the trusted automation control plane. Automated
 * repairs are not permitted to edit it. It uses Node and Git only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { posix, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MAX_PROPOSAL_BYTES = 240_000;
export const MAX_PATCH_BYTES = 200_000;
export const MAX_CHANGED_PATHS = 25;

const REQUIRED_KEYS = ['patch', 'status', 'summary'];
const ALLOWED_MODES = new Set(['100644', '100755']);
const FORBIDDEN_EXACT_PATHS = new Set([
  'AGENTS.md',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'eslint.config.js',
  'eslint.config.mjs',
  'playwright.config.ts',
  'playwright.demo.config.ts',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.config.js',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'docs/CODEX_AUTOMATION.md',
  'docs/codex-takeover/00_MASTER_PROMPT.md',
  'docs/codex-takeover/05_GUARDRAILS.md',
  'docs/codex-takeover/STATUS.md',
  'docs/release/e2e-results.json',
  'scripts/apply-codex-proposal.mjs',
  'scripts/apply-codex-proposal.test.mjs',
  'scripts/audit-submission.mjs',
  'scripts/verify-release.mjs',
  'scripts/verify-sw.mjs',
]);
const FORBIDDEN_PREFIXES = [
  '.git/',
  '.github/',
  'artifacts/hourly/',
  'playwright-report/',
  'test-results/',
];

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function parseProposal(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('Codex returned an empty proposal.');
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error(`Proposal exceeds ${MAX_PROPOSAL_BYTES} bytes.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Proposal is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Proposal must be a JSON object.');
  }

  const keys = Object.keys(parsed).sort();
  if (keys.length !== REQUIRED_KEYS.length || !keys.every((key, index) => key === REQUIRED_KEYS[index])) {
    throw new Error(`Proposal must contain only: ${REQUIRED_KEYS.join(', ')}.`);
  }
  if (!['repair', 'no_change'].includes(parsed.status)) {
    throw new Error('Proposal status must be repair or no_change.');
  }
  if (typeof parsed.summary !== 'string' || parsed.summary.length > 2_000) {
    throw new Error('Proposal summary must be a string no longer than 2000 characters.');
  }
  if (typeof parsed.patch !== 'string') {
    throw new Error('Proposal patch must be a string.');
  }

  if (parsed.status === 'no_change') {
    if (parsed.patch.trim() !== '') throw new Error('A no_change proposal must have an empty patch.');
    return parsed;
  }

  if (parsed.patch.trim() === '') throw new Error('A repair proposal must contain a patch.');
  if (Buffer.byteLength(parsed.patch, 'utf8') > MAX_PATCH_BYTES) {
    throw new Error(`Patch exceeds ${MAX_PATCH_BYTES} bytes.`);
  }
  if (!parsed.patch.startsWith('diff --git ')) {
    throw new Error('Patch must be a unified Git diff beginning with "diff --git".');
  }
  if (parsed.patch.includes('\0')) throw new Error('Patch contains a NUL byte.');
  if (/^GIT binary patch$|^Binary files .* differ$/m.test(parsed.patch)) {
    throw new Error('Binary patches are not accepted by hourly repair.');
  }

  return parsed;
}

export function isForbiddenPath(path) {
  if (typeof path !== 'string' || path === '') return true;
  if (/[\u0000-\u001f\u007f\\]/u.test(path)) return true;
  if (path.startsWith('/') || path === '.' || path === '..') return true;
  const normalized = posix.normalize(path);
  if (normalized !== path || normalized.startsWith('../')) return true;

  const segments = path.split('/');
  if (segments.some((segment) => segment === '.git' || segment.startsWith('.env'))) return true;
  if (FORBIDDEN_EXACT_PATHS.has(path)) return true;
  return FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function stagedDiff(cwd) {
  return runGit(['diff', '--cached', '--binary', '--no-color', '--no-ext-diff', 'HEAD'], cwd);
}

function stagedPaths(cwd) {
  const output = runGit(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACDMRTUXB'], cwd);
  return output.split('\0').filter(Boolean);
}

function assertAllowedPathsAndModes(cwd) {
  const paths = stagedPaths(cwd);
  if (paths.length === 0) throw new Error('Patch produced no staged repository change.');
  if (paths.length > MAX_CHANGED_PATHS) {
    throw new Error(`Patch changes ${paths.length} paths; hourly repair permits at most ${MAX_CHANGED_PATHS}.`);
  }

  const forbidden = paths.filter(isForbiddenPath);
  if (forbidden.length > 0) {
    throw new Error(`Patch touches protected path(s): ${forbidden.join(', ')}`);
  }

  const changed = new Set(paths);
  const stageOutput = runGit(['ls-files', '--stage', '-z'], cwd);
  for (const entry of stageOutput.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const metadata = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (!changed.has(path)) continue;
    const mode = metadata[0];
    if (!ALLOWED_MODES.has(mode)) {
      throw new Error(`Patch creates unsupported mode ${mode} at ${path}.`);
    }
  }

  runGit(['diff', '--cached', '--check'], cwd);
  return paths;
}

export async function applyProposal({ raw, cwd = process.cwd(), expectedPatchSha256, expectedStagedDiffSha256 } = {}) {
  const proposal = parseProposal(raw);
  if (proposal.status === 'no_change') {
    return { status: 'no_change', patchSha256: null, stagedDiffSha256: null, changedPaths: [] };
  }

  const patchSha256 = sha256(proposal.patch);
  if (expectedPatchSha256 && patchSha256 !== expectedPatchSha256) {
    throw new Error(`Patch SHA-256 mismatch: expected ${expectedPatchSha256}, got ${patchSha256}.`);
  }

  const patchPath = resolve(tmpdir(), `cherry-codex-repair-${randomUUID()}.patch`);
  await writeFile(patchPath, proposal.patch, { encoding: 'utf8', mode: 0o600 });
  try {
    runGit(['apply', '--check', '--whitespace=error-all', patchPath], cwd);
    runGit(['apply', '--index', '--whitespace=error-all', patchPath], cwd);
    const changedPaths = assertAllowedPathsAndModes(cwd);
    const stagedDiffSha256 = sha256(stagedDiff(cwd));
    if (expectedStagedDiffSha256 && stagedDiffSha256 !== expectedStagedDiffSha256) {
      throw new Error(`Staged diff SHA-256 mismatch: expected ${expectedStagedDiffSha256}, got ${stagedDiffSha256}.`);
    }
    return { status: 'repair', patchSha256, stagedDiffSha256, changedPaths };
  } finally {
    await unlink(patchPath).catch(() => {});
  }
}

export function attestStagedProposal({ cwd = process.cwd(), expectedStagedDiffSha256 } = {}) {
  if (!expectedStagedDiffSha256) throw new Error('EXPECTED_STAGED_DIFF_SHA256 is required.');
  const changedPaths = assertAllowedPathsAndModes(cwd);
  const actual = sha256(stagedDiff(cwd));
  if (actual !== expectedStagedDiffSha256) {
    throw new Error(`Staged diff changed during verification: expected ${expectedStagedDiffSha256}, got ${actual}.`);
  }
  const unstaged = runGit(['status', '--porcelain=v1', '--untracked-files=normal'], cwd)
    .split('\n')
    .filter(Boolean)
    .filter((line) => line.slice(1, 2) !== ' ');
  if (unstaged.length > 0) {
    throw new Error(`Verification left uncommitted changes: ${unstaged.join('; ')}`);
  }
  return { verified: true, stagedDiffSha256: actual, changedPaths };
}

async function writeActionOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const marker = `CHERRY_${randomUUID().replaceAll('-', '')}`;
  await appendFile(output, `${name}<<${marker}\n${value}\n${marker}\n`, 'utf8');
}

async function runCli(argv = process.argv.slice(2)) {
  const mode = argv[0] ?? 'apply';
  if (mode === 'apply') {
    const result = await applyProposal({
      raw: process.env.CODEX_PROPOSAL_JSON,
      expectedPatchSha256: process.env.EXPECTED_PATCH_SHA256 || undefined,
      expectedStagedDiffSha256: process.env.EXPECTED_STAGED_DIFF_SHA256 || undefined,
    });
    await writeActionOutput('status', result.status);
    if (result.patchSha256) await writeActionOutput('patch_sha256', result.patchSha256);
    if (result.stagedDiffSha256) await writeActionOutput('staged_diff_sha256', result.stagedDiffSha256);
    await writeActionOutput('changed_paths', JSON.stringify(result.changedPaths));
    console.log(result.status === 'repair'
      ? `Applied bounded repair to ${result.changedPaths.length} path(s).`
      : 'Codex returned no safe repository change.');
    return;
  }
  if (mode === 'attest') {
    const result = attestStagedProposal({
      expectedStagedDiffSha256: process.env.EXPECTED_STAGED_DIFF_SHA256,
    });
    await writeActionOutput('verified', 'true');
    await writeActionOutput('staged_diff_sha256', result.stagedDiffSha256);
    console.log(`Verified unchanged staged repair across ${result.changedPaths.length} path(s).`);
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executedDirectly) {
  try {
    await runCli();
  } catch (error) {
    console.error(`apply-codex-proposal: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
