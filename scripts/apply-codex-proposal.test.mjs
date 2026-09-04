import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  applyProposal,
  attestStagedProposal,
  isForbiddenPath,
  parseProposal,
  sha256,
} from './apply-codex-proposal.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

async function makeRepo() {
  const cwd = await mkdtemp(join(tmpdir(), 'cherry-proposal-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.name', 'Cherry Test');
  git(cwd, 'config', 'user.email', 'cherry@example.invalid');
  await writeFile(join(cwd, 'value.txt'), 'before\n', 'utf8');
  git(cwd, 'add', 'value.txt');
  git(cwd, 'commit', '-qm', 'baseline');
  return cwd;
}

function proposal(patch, status = 'repair') {
  return JSON.stringify({ status, summary: status === 'repair' ? 'Update the fixture.' : 'No safe change.', patch });
}

test('parseProposal accepts a bounded no-change result and rejects extra fields', () => {
  assert.equal(parseProposal(proposal('', 'no_change')).status, 'no_change');
  assert.throws(
    () => parseProposal(JSON.stringify({ status: 'no_change', summary: '', patch: '', command: 'rm -rf /' })),
    /must contain only/,
  );
});

test('protected control-plane and credential paths are rejected', () => {
  for (const path of [
    '.github/workflows/hourly-maintenance.yml',
    'package.json',
    'AGENTS.md',
    'scripts/apply-codex-proposal.mjs',
    'docs/codex-takeover/STATUS.md',
    'src/.env.production',
    '../outside.txt',
  ]) {
    assert.equal(isForbiddenPath(path), true, path);
  }
  assert.equal(isForbiddenPath('src/cherry/mission/mission-service.ts'), false);
});

test('a safe textual patch applies, stages, and attests with stable hashes', async () => {
  const cwd = await makeRepo();
  try {
    await writeFile(join(cwd, 'value.txt'), 'after\n', 'utf8');
    const patch = git(cwd, 'diff', '--binary', '--no-color', '--no-ext-diff', 'HEAD');
    git(cwd, 'restore', 'value.txt');

    const applied = await applyProposal({ raw: proposal(patch), cwd, expectedPatchSha256: sha256(patch) });
    assert.equal(applied.status, 'repair');
    assert.deepEqual(applied.changedPaths, ['value.txt']);
    assert.equal(await readFile(join(cwd, 'value.txt'), 'utf8'), 'after\n');

    const attested = attestStagedProposal({ cwd, expectedStagedDiffSha256: applied.stagedDiffSha256 });
    assert.equal(attested.verified, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a patch touching protected package metadata is refused before verification', async () => {
  const cwd = await makeRepo();
  try {
    await writeFile(join(cwd, 'package.json'), '{"name":"baseline"}\n', 'utf8');
    git(cwd, 'add', 'package.json');
    git(cwd, 'commit', '-qm', 'add package');
    await writeFile(join(cwd, 'package.json'), '{"name":"changed"}\n', 'utf8');
    const patch = git(cwd, 'diff', '--binary', '--no-color', '--no-ext-diff', 'HEAD');
    git(cwd, 'restore', 'package.json');

    await assert.rejects(() => applyProposal({ raw: proposal(patch), cwd }), /protected path.*package\.json/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
