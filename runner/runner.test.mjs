import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:47821';
let child;
let token;
let workDir;

function api(path, options = {}) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-cherry-pair': token, ...(options.headers ?? {}) },
  });
}

async function waitForJob(jobId, timeoutMs = 30_000) {
  const startedAt = Date.now();
  for (;;) {
    const response = await api(`/jobs/${jobId}`);
    const { job } = await response.json();
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    if (Date.now() - startedAt > timeoutMs) throw new Error(`job ${jobId} did not finish`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

before(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'cherry-runner-test-'));
  token = 'test-pair-token-0123456789';
  child = spawn(process.execPath, [join(here, 'server.mjs'), '--root', workDir, '--state', join(workDir, '.state')], {
    env: { ...process.env, CHERRY_RUNNER_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for the listener.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/status`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error('runner did not start');
});

after(() => {
  child?.kill('SIGKILL');
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* windows file locks */
  }
});

test('status endpoint reports pairing separately from reachability', async () => {
  const unauthenticated = await fetch(`${BASE}/status`);
  const unauthenticatedBody = await unauthenticated.json();
  assert.equal(unauthenticatedBody.paired, false);

  const authenticated = await api('/status');
  const authenticatedBody = await authenticated.json();
  assert.equal(authenticatedBody.paired, true);
  assert.ok(authenticatedBody.adapters.includes('cherry-verify'));
});

test('jobs endpoint rejects requests without the pairing token', async () => {
  const response = await fetch(`${BASE}/jobs`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  assert.equal(response.status, 401);
});

test('disallowed origins are refused', async () => {
  const response = await fetch(`${BASE}/status`, { headers: { origin: 'https://evil.example' } });
  assert.equal(response.status, 403);
});

test('unknown adapters and traversal working directories are rejected', async () => {
  const unknown = await api('/jobs', { method: 'POST', body: JSON.stringify({ adapter: 'rm-rf-everything' }) });
  assert.equal(unknown.status, 400);

  const traversal = await api('/jobs', {
    method: 'POST',
    body: JSON.stringify({ adapter: 'shell-safe', workingDirectory: 'C:\\Windows\\System32' }),
  });
  assert.equal(traversal.status, 400);
});

test('shell-safe refuses executables that are not allowlisted', async () => {
  const response = await api('/jobs', {
    method: 'POST',
    body: JSON.stringify({ adapter: 'shell-safe', input: { executable: 'powershell', args: ['-c', 'whoami'] } }),
  });
  assert.equal(response.status, 201);
  const { jobId } = await response.json();
  const job = await waitForJob(jobId);
  assert.equal(job.status, 'failed');
  assert.match(job.result.stderr, /not allowlisted/);
});

test('cherry-export produces a hash manifest for an approved directory', async () => {
  const dataDir = join(workDir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'hello.txt'), 'cherry');
  const response = await api('/jobs', {
    method: 'POST',
    body: JSON.stringify({ adapter: 'cherry-export', input: { dir: dataDir } }),
  });
  const { jobId } = await response.json();
  const job = await waitForJob(jobId);
  assert.equal(job.status, 'succeeded');
  assert.match(job.result.stdout, /Manifest of 1 files/);
});

test('cherry-export refuses directories outside approved roots', async () => {
  const response = await api('/jobs', {
    method: 'POST',
    body: JSON.stringify({ adapter: 'cherry-export', input: { dir: tmpdir() } }),
  });
  const { jobId } = await response.json();
  const job = await waitForJob(jobId);
  assert.equal(job.status, 'failed');
  assert.match(job.result.stderr, /outside approved roots/);
});

test('cherry-verify runs a real bundle verify script and detects tampering', async () => {
  // Build a minimal bundle with a valid manifest…
  const bundle = join(workDir, 'bundle');
  mkdirSync(join(bundle, 'scripts'), { recursive: true });
  writeFileSync(join(bundle, 'SKILL.md'), '---\nname: bundle\ndescription: test\n---\nBody');
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const skillHash = createHash('sha256').update(readFileSync(join(bundle, 'SKILL.md'))).digest('hex');
  // Reuse the real verify script generator from the app source.
  const { buildVerifyScript } = await import('../src/cherry/compiler/target-files.ts').catch(() => ({ buildVerifyScript: null }));
  let script;
  if (buildVerifyScript) {
    script = buildVerifyScript();
  } else {
    // Node cannot import .ts directly: read it and extract the raw template.
    const source = readFileSync(join(here, '..', 'src', 'cherry', 'compiler', 'target-files.ts'), 'utf8');
    const match = /return String\.raw`([\s\S]*?)`;\s*}\s*$/m.exec(source);
    assert.ok(match, 'verify script template found in target-files.ts');
    script = match[1];
  }
  writeFileSync(join(bundle, 'scripts', 'verify.mjs'), script);
  writeFileSync(join(bundle, 'MANIFEST.json'), JSON.stringify({ algorithm: 'SHA-256', files: { 'SKILL.md': skillHash } }));

  const okResponse = await api('/jobs', { method: 'POST', body: JSON.stringify({ adapter: 'cherry-verify', input: { bundleDir: bundle } }) });
  const okJob = await waitForJob((await okResponse.json()).jobId);
  assert.equal(okJob.status, 'succeeded');
  assert.match(okJob.result.stdout, /Bundle verification passed/);

  // …then tamper with a file: verification must fail.
  writeFileSync(join(bundle, 'SKILL.md'), '---\nname: bundle\ndescription: test\n---\nTampered body');
  const badResponse = await api('/jobs', { method: 'POST', body: JSON.stringify({ adapter: 'cherry-verify', input: { bundleDir: bundle } }) });
  const badJob = await waitForJob((await badResponse.json()).jobId);
  assert.equal(badJob.status, 'failed');
  assert.match(badJob.result.stderr + badJob.result.stdout, /hash mismatch/);
});

test('output redaction removes secret-shaped strings', async () => {
  const dataDir = join(workDir, 'redact');
  mkdirSync(dataDir, { recursive: true });
  // shell-safe with node is not allowlisted in this test process, so exercise
  // redaction through the failure path message instead: craft an adapter error
  // containing a secret-shaped token via bundleDir name.
  const response = await api('/jobs', {
    method: 'POST',
    body: JSON.stringify({ adapter: 'cherry-verify', input: { bundleDir: join(workDir, 'sk-abcdefghijklmnop1234') } }),
  });
  const job = await waitForJob((await response.json()).jobId);
  assert.equal(job.status, 'failed');
  assert.ok(!job.result.stderr.includes('sk-abcdefghijklmnop1234'));
});

// Runner v2 suites (durable queue, scheduler, events, adapters, HTTP wiring).
// Dynamic import AFTER the hooks above are registered, because the
// test:runner script lists explicit files and cannot be changed here.
await import('./v2.test.mjs');
