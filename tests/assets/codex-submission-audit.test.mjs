import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifier = join(repoRoot, 'scripts', 'verify-codex-submission.mjs');

function runAudit() {
  return spawnSync(process.execPath, [verifier], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('judge-facing Cherry surfaces stay Codex and WebMCP focused', () => {
  const result = runAudit();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS judge-facing application and canonical docs are vendor-neutral/);
});

test('submission anchors include the live judge route and hourly monitor', () => {
  const result = runAudit();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS Codex, WebMCP, judge-route and hourly-monitor anchors are present/);
  assert.match(result.stdout, /audit-codex-submission: 0 FAIL/);
});


test('verify:all keeps the Codex submission audit in the release chain', async () => {
  const packageJson = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(join(repoRoot, 'package.json'), 'utf8')));
  assert.match(packageJson.scripts['verify:all'], /npm run audit:codex-submission/);
});
