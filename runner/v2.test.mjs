/**
 * Runner v2 tests: durable queue, leases, worker pool, idempotency, retry,
 * cancellation, timeout, crash recovery, schedule math, scheduler policies,
 * durable events chain, adapters, and HTTP wiring.
 * Imported by runner.test.mjs so `npm run test:runner` picks everything up.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeActionHash, canonicalize, sha256Hex } from './lib/canonical.mjs';
import { EventsLog } from './lib/events.mjs';
import { DurableQueue, validateEnvelope } from './lib/queue.mjs';
import { Scheduler } from './lib/scheduler.mjs';
import { nextRunAt } from './lib/schedule.mjs';
import { createAdapters } from './lib/adapters.mjs';
import { saveJsonAtomic } from './lib/store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tempDirs = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows file locks */
    }
  }
});

function makeEnvelope(overrides = {}) {
  const envelope = {
    schemaVersion: 1,
    workspaceId: 'ws-1',
    workItemId: 'wi-1',
    workItemRevision: 1,
    adapter: 'safe-command',
    workingDirectory: null,
    boundedPrompt: '{}',
    allowedExecutables: [],
    verificationPlan: [],
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  envelope.actionHash = computeActionHash(envelope);
  return envelope;
}

// ---------------- 1. canonical hash ----------------

test('actionHash is stable across key order, excludes actionHash, changes with content', () => {
  const a = { schemaVersion: 1, workspaceId: 'ws', adapter: 'x', boundedPrompt: 'p' };
  const b = { boundedPrompt: 'p', adapter: 'x', workspaceId: 'ws', schemaVersion: 1, actionHash: 'ignored' };
  assert.equal(computeActionHash(a), computeActionHash(b));
  assert.notEqual(computeActionHash(a), computeActionHash({ ...a, boundedPrompt: 'q' }));
});

test('validateEnvelope refuses a tampered actionHash with a clear reason', () => {
  const envelope = makeEnvelope();
  envelope.boundedPrompt = 'tampered after hashing';
  const problems = validateEnvelope(envelope);
  assert.ok(problems.some((problem) => /actionHash does not match/.test(problem)));
});

// ---------------- 4. idempotency ----------------

test('enqueue refuses a duplicate idempotencyKey with a clear reason', () => {
  const queue = new DurableQueue({ dataDir: tempDir('q-idem-') });
  assert.equal(queue.enqueue(makeEnvelope({ idempotencyKey: 'dup-1' })).ok, true);
  const second = queue.enqueue(makeEnvelope({ idempotencyKey: 'dup-1' }));
  assert.equal(second.ok, false);
  assert.equal(second.code, 'duplicate');
  assert.match(second.reason, /duplicate idempotencyKey "dup-1"/);
});

// ---------------- 2. leases + heartbeats ----------------

test('an expired lease returns the job to queued and it can be re-claimed', () => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const queue = new DurableQueue({ dataDir: tempDir('q-lease-'), now: () => clock, leaseTtlMs: 1000 });
  queue.enqueue(makeEnvelope());
  const claimed = queue.claim();
  assert.equal(claimed.job.status, 'leased');
  clock += 1001;
  assert.equal(queue.expireLeases(), 1);
  assert.equal(queue.getJob(claimed.job.id).status, 'queued');
  assert.ok(queue.claim());
});

test('heartbeat extends the lease past its original expiry', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  let clock = start;
  const queue = new DurableQueue({ dataDir: tempDir('q-hb-'), now: () => clock, leaseTtlMs: 1000 });
  queue.enqueue(makeEnvelope());
  const { job, lease } = queue.claim();
  clock = start + 900;
  assert.equal(queue.heartbeat(job.id, lease.leaseId), true);
  clock = start + 1500; // past original expiry, inside the extension
  assert.equal(queue.expireLeases(), 0);
  assert.equal(queue.getJob(job.id).status, 'leased');
  clock = start + 2000; // past the extended expiry (900 + 1000)
  assert.equal(queue.expireLeases(), 1);
  assert.equal(queue.heartbeat(job.id, lease.leaseId), false, 'a lost lease cannot heartbeat');
});

// ---------------- 5. bounded retry with exponential backoff ----------------

test('failures retry with exponential backoff then fail after max attempts', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  let clock = start;
  const queue = new DurableQueue({ dataDir: tempDir('q-retry-'), now: () => clock, backoffBaseMs: 1000, maxAttempts: 3 });
  const { jobId } = queue.enqueue(makeEnvelope());

  const first = queue.claim();
  queue.fail(first.job.id, first.lease.leaseId, { message: 'boom-1' });
  assert.equal(queue.getJob(jobId).status, 'queued');
  assert.equal(queue.getJob(jobId).notBefore, new Date(start + 1000).toISOString());
  assert.equal(queue.claim(), null, 'backoff makes the job ineligible until notBefore');

  clock = start + 1000;
  const second = queue.claim();
  assert.ok(second);
  queue.fail(second.job.id, second.lease.leaseId, { message: 'boom-2' });
  assert.equal(queue.getJob(jobId).notBefore, new Date(start + 1000 + 2000).toISOString());

  clock = start + 2999;
  assert.equal(queue.claim(), null);
  clock = start + 3000;
  const third = queue.claim();
  queue.fail(third.job.id, third.lease.leaseId, { message: 'boom-3' });
  assert.equal(queue.getJob(jobId).status, 'failed');
  assert.equal(queue.getJob(jobId).attempts, 3);
});

// ---------------- 3. worker pool ----------------

test('worker pool never exceeds the configured concurrency', async () => {
  const queue = new DurableQueue({ dataDir: tempDir('q-pool-'), concurrency: 2 });
  for (let index = 0; index < 5; index += 1) queue.enqueue(makeEnvelope({ idempotencyKey: `pool-${index}` }));
  let running = 0;
  let peak = 0;
  const executor = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    running -= 1;
    return { status: 'completed' };
  };
  queue.runPending(executor);
  assert.equal(queue.active.size, 2);
  await queue.whenIdle();
  assert.equal(peak, 2);
  assert.ok(queue.list().every((job) => job.status === 'completed'));
});

test('concurrency outside 1-3 is refused', () => {
  assert.throws(() => new DurableQueue({ dataDir: tempDir('q-conc-'), concurrency: 4 }), /between 1 and 3/);
  assert.throws(() => new DurableQueue({ dataDir: tempDir('q-conc0-'), concurrency: 0 }), /between 1 and 3/);
});

// ---------------- 6. cancellation + timeout ----------------

test('cancelling a queued job moves it to cancelled and logs an event', () => {
  const dir = tempDir('q-cancel-');
  const events = new EventsLog(join(dir, 'events.log'));
  const queue = new DurableQueue({ dataDir: dir, events });
  const { jobId } = queue.enqueue(makeEnvelope());
  assert.equal(queue.cancel(jobId).status, 'cancelled');
  assert.deepEqual(events.readSince(0).map((event) => event.type), ['enqueued', 'cancelled']);
});

test('cancelling a running job aborts the executor', async () => {
  const queue = new DurableQueue({ dataDir: tempDir('q-cancel-run-') });
  const { jobId } = queue.enqueue(makeEnvelope());
  const executor = (envelope, { signal }) =>
    new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => resolvePromise({ status: 'completed' }), 500);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        rejectPromise(new Error('aborted'));
      });
    });
  queue.runPending(executor);
  queue.cancel(jobId);
  await queue.whenIdle();
  assert.equal(queue.getJob(jobId).status, 'cancelled');
});

test('a job that exceeds its timeout is aborted and fails', async () => {
  const queue = new DurableQueue({ dataDir: tempDir('q-timeout-'), maxAttempts: 1, defaultTimeoutMs: 30 });
  const { jobId } = queue.enqueue(makeEnvelope());
  const executor = (envelope, { signal }) =>
    new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => resolvePromise({ status: 'completed' }), 300);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        rejectPromise(new Error(String(signal.reason?.message ?? signal.reason)));
      });
    });
  queue.runPending(executor);
  await queue.whenIdle();
  const job = queue.getJob(jobId);
  assert.equal(job.status, 'failed');
  assert.match(job.lastError, /timed out/);
});

// ---------------- 7. crash recovery ----------------

test('a fresh instance re-queues jobs whose leases expired while stopped', () => {
  const dir = tempDir('q-crash-');
  const baseJob = {
    attempts: 0,
    notBefore: null,
    cancelRequested: false,
    timeoutMs: null,
    result: null,
    lastError: null,
    createdAt: '2025-12-31T23:59:00.000Z',
  };
  saveJsonAtomic(join(dir, 'queue-jobs.json'), [
    {
      ...baseJob,
      id: 'job-dead',
      envelope: makeEnvelope({ idempotencyKey: 'crash-dead' }),
      status: 'running',
      lease: { jobId: 'job-dead', leaseId: 'lease-x', expiresAt: '2026-01-01T00:00:00.000Z' },
    },
    {
      ...baseJob,
      id: 'job-live',
      envelope: makeEnvelope({ idempotencyKey: 'crash-live' }),
      status: 'leased',
      lease: { jobId: 'job-live', leaseId: 'lease-y', expiresAt: '2099-01-01T00:00:00.000Z' },
    },
  ]);
  const queue = new DurableQueue({ dataDir: dir });
  assert.equal(queue.getJob('job-dead').status, 'queued');
  assert.equal(queue.getJob('job-dead').lease, null);
  assert.equal(queue.getJob('job-live').status, 'leased', 'an unexpired lease is honoured');
});

// ---------------- 9. durable events chain ----------------

test('events chain verifies, readSince filters, tampering breaks the chain', () => {
  const path = join(tempDir('ev-'), 'events.log');
  const log = new EventsLog(path);
  log.append('job-1', 'enqueued');
  log.append('job-1', 'started');
  log.append('job-1', 'completed');
  assert.deepEqual(log.verify(), { ok: true, length: 3 });
  assert.deepEqual(log.readSince(2).map((event) => event.type), ['completed']);

  // Client-side rolling verification from a known chain value.
  let previous = '';
  for (const { seq, jobId, type, at, chain } of log.readAll()) {
    assert.equal(chain, sha256Hex(previous + canonicalize({ seq, jobId, type, at })));
    previous = chain;
  }

  // Tamper with the middle line: verification must break there.
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  const tampered = JSON.parse(lines[1]);
  tampered.type = 'completed';
  lines[1] = JSON.stringify(tampered);
  writeFileSync(path, lines.join('\n') + '\n');
  const verdict = new EventsLog(path).verify();
  assert.equal(verdict.ok, false);
  assert.equal(verdict.brokenAt, 2);
});

// ---------------- 8. schedule math ----------------

test('nextRunAt: interval steps deterministically; once/manual handle the past', () => {
  const spec = { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(nextRunAt(spec, '2026-01-01T00:00:00.000Z'), '2026-01-01T00:05:00.000Z');
  assert.equal(nextRunAt(spec, '2026-01-01T00:05:00.000Z'), '2026-01-01T00:10:00.000Z');
  assert.equal(nextRunAt(spec, '2025-12-31T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  assert.equal(nextRunAt({ kind: 'manual' }, '2026-01-01T00:00:00.000Z'), null);
  assert.equal(nextRunAt({ kind: 'once', runAt: '2026-01-01T00:00:00.000Z' }, '2026-06-01T00:00:00.000Z'), null);
  assert.equal(nextRunAt({ kind: 'once', runAt: '2026-01-02T00:00:00.000Z' }, '2026-01-01T00:00:00.000Z'), '2026-01-02T00:00:00.000Z');
});

test('nextRunAt: daily is DST-aware across the Europe/London spring transition', () => {
  const spec = { kind: 'daily', localTime: '09:00', timeZone: 'Europe/London' };
  // 28 Mar 2026 is GMT (09:00 local = 09:00Z); 29 Mar 2026 is BST (09:00 local = 08:00Z).
  assert.equal(nextRunAt(spec, '2026-03-28T00:00:00.000Z'), '2026-03-28T09:00:00.000Z');
  assert.equal(nextRunAt(spec, '2026-03-28T12:00:00.000Z'), '2026-03-29T08:00:00.000Z');
});

test('nextRunAt: weekly picks the next matching weekday', () => {
  const spec = { kind: 'weekly', weekdays: [1], localTime: '10:00', timeZone: 'UTC' };
  // 2026-01-01 is a Thursday; the next Monday is 2026-01-05.
  assert.equal(nextRunAt(spec, '2026-01-01T00:00:00.000Z'), '2026-01-05T10:00:00.000Z');
});

// ---------------- 8. scheduler materialisation ----------------

test('scheduler materialises an interval routine exactly once per due time', () => {
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const materialised = [];
  const scheduler = new Scheduler({
    dataDir: tempDir('sched-once-'),
    now: () => clock,
    materialise: (routine, dueIso) => materialised.push(dueIso),
  });
  scheduler.setRoutines([
    { id: 'r1', schedule: { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' }, missedRunPolicy: 'skip' },
  ]);
  scheduler.tick(); // anchors the brand-new routine; nothing due yet
  assert.equal(materialised.length, 0);
  clock += 5 * 60000;
  scheduler.tick();
  assert.deepEqual(materialised, ['2026-01-01T00:05:00.000Z']);
  scheduler.tick();
  scheduler.tick(); // repeated ticks at the same instant stay exactly-once
  assert.equal(materialised.length, 1);
  clock += 5 * 60000;
  scheduler.tick();
  assert.deepEqual(materialised, ['2026-01-01T00:05:00.000Z', '2026-01-01T00:10:00.000Z']);
});

test("missed runs while stopped: 'skip' drops the backlog, 'run_once_on_reconnect' runs one", () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (const [policy, expected] of [['skip', 0], ['run_once_on_reconnect', 1]]) {
    const dir = tempDir(`sched-${policy}-`);
    // Persisted cursor from a previous life: three interval runs were missed.
    saveJsonAtomic(join(dir, 'scheduler-state.json'), { r1: { cursor: '2026-01-01T00:00:00.000Z' } });
    const materialised = [];
    const scheduler = new Scheduler({ dataDir: dir, materialise: (routine, dueIso) => materialised.push(dueIso) });
    scheduler.setRoutines([
      { id: 'r1', schedule: { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' }, missedRunPolicy: policy },
    ]);
    scheduler.tick(start + 16 * 60000);
    assert.equal(materialised.length, expected, `policy ${policy}`);
    if (policy === 'run_once_on_reconnect') {
      assert.deepEqual(materialised, ['2026-01-01T00:15:00.000Z'], 'the latest missed due time runs once');
    }
    // After reconnect handling, normal ticks materialise on time again.
    const next = scheduler.tick(start + 20 * 60000);
    assert.equal(next.length, 1);
    assert.equal(next[0].dueAt, '2026-01-01T00:20:00.000Z');
  }
});

// ---------------- 10. adapters ----------------

test('safe-command runs exact argv for a config-allowlisted executable and redacts output', async () => {
  const root = tempDir('ad-safe-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set([process.execPath]) });
  const envelope = makeEnvelope({
    workingDirectory: root,
    boundedPrompt: JSON.stringify({ argv: [process.execPath, '-e', "console.log('token sk-abcdefghijklmnop1234 ok')"] }),
  });
  const result = await adapters.run(envelope);
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.ok(!result.stdout.includes('sk-abcdefghijklmnop1234'), 'secret-shaped output is redacted');
  assert.match(result.stdout, /\[redacted\] ok/);
});

test('safe-command refuses executables missing from the config allowlist', async () => {
  const root = tempDir('ad-safe-refuse-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set() });
  const envelope = makeEnvelope({ workingDirectory: root, boundedPrompt: JSON.stringify({ argv: ['powershell', '-c', 'whoami'] }) });
  await assert.rejects(() => adapters.run(envelope), /not in the runner config allowlist/);
});

test('provider CLIs require BOTH the envelope allowlist and the config allowlist', async () => {
  const root = tempDir('ad-cli-');
  const configOnly = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(['codex']) });
  await assert.rejects(
    () => configOnly.run(makeEnvelope({ adapter: 'codex-cli', workingDirectory: root, boundedPrompt: 'do things', allowedExecutables: [] })),
    /not allowed by the execution envelope/,
  );
  const envelopeOnly = createAdapters({ allowedRoots: [root], allowedExecutables: new Set() });
  await assert.rejects(
    () => envelopeOnly.run(makeEnvelope({ adapter: 'claude-cli', workingDirectory: root, boundedPrompt: 'do things', allowedExecutables: ['claude'] })),
    /not in the runner config allowlist/,
  );
});

test('cherry-verify maps verify.mjs exit codes to completed/failed — never verified', async () => {
  const root = tempDir('ad-verify-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set() });
  const good = join(root, 'good');
  mkdirSync(good);
  writeFileSync(join(good, 'verify.mjs'), "console.log('checks passed');process.exit(0);");
  const ok = await adapters.run(makeEnvelope({ adapter: 'cherry-verify', workingDirectory: good }));
  assert.equal(ok.status, 'completed');
  assert.match(ok.stdout, /checks passed/);

  const bad = join(root, 'bad');
  mkdirSync(bad);
  writeFileSync(join(bad, 'verify.mjs'), "console.error('hash mismatch');process.exit(1);");
  const failed = await adapters.run(makeEnvelope({ adapter: 'cherry-verify', workingDirectory: bad }));
  assert.equal(failed.status, 'failed');
  for (const result of [ok, failed]) assert.notEqual(result.status, 'verified');
});

test('cherry-export copies declared files into an output dir under allowed roots', async () => {
  const root = tempDir('ad-export-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set() });
  const sourceDir = join(root, 'src');
  mkdirSync(join(sourceDir, 'nested'), { recursive: true });
  writeFileSync(join(sourceDir, 'a.txt'), 'alpha');
  writeFileSync(join(sourceDir, 'nested', 'b.txt'), 'beta');
  const outputDir = join(root, 'out');
  const result = await adapters.run(
    makeEnvelope({
      adapter: 'cherry-export',
      workingDirectory: sourceDir,
      boundedPrompt: JSON.stringify({ files: ['a.txt', 'nested/b.txt'], outputDir }),
    }),
  );
  assert.equal(result.status, 'completed');
  assert.equal(readFileSync(join(outputDir, 'a.txt'), 'utf8'), 'alpha');
  assert.equal(readFileSync(join(outputDir, 'nested', 'b.txt'), 'utf8'), 'beta');

  await assert.rejects(
    () =>
      adapters.run(
        makeEnvelope({
          adapter: 'cherry-export',
          workingDirectory: sourceDir,
          boundedPrompt: JSON.stringify({ files: ['a.txt'], outputDir: tmpdir() }),
        }),
      ),
    /outside approved roots/,
  );
  await assert.rejects(
    () =>
      adapters.run(
        makeEnvelope({
          adapter: 'cherry-export',
          workingDirectory: sourceDir,
          boundedPrompt: JSON.stringify({ files: ['../escape.txt'], outputDir }),
        }),
      ),
    /escapes its directory/,
  );
});

// ---------------- HTTP wiring (own server instance on its own port) ----------------

describe('runner v2 HTTP wiring', () => {
  const V2_BASE = 'http://127.0.0.1:47831';
  const v2Token = 'v2-pair-token-0123456789';
  let child;
  let workDir;

  const v2api = (path, options = {}) =>
    fetch(`${V2_BASE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-cherry-pair': v2Token, ...(options.headers ?? {}) },
    });

  before(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'cherry-v2-e2e-'));
    child = spawn(
      process.execPath,
      [
        join(here, 'server.mjs'),
        '--root', workDir,
        '--state', join(workDir, '.state'),
        '--port', '47831',
        '--allow-exec', process.execPath,
      ],
      { env: { ...process.env, CHERRY_RUNNER_TOKEN: v2Token }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`${V2_BASE}/status`);
        if (response.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error('v2 runner did not start');
  });

  after(() => {
    child?.kill('SIGKILL');
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* windows file locks */
    }
  });

  test('status reports the v2 adapter registry', async () => {
    const response = await v2api('/status');
    const body = await response.json();
    assert.deepEqual(
      body.v2.adapters.sort(),
      ['cherry-export', 'cherry-verify', 'claude-cli', 'codex-cli', 'safe-command', 'scrapling-fetch'].sort(),
    );
  });

  test('enqueue → execute → events chain verifies over HTTP; duplicates are 409', async () => {
    const envelope = makeEnvelope({
      workingDirectory: workDir,
      boundedPrompt: JSON.stringify({ argv: [process.execPath, '-e', "console.log('v2-e2e-ok')"] }),
      idempotencyKey: 'e2e-1',
    });
    const created = await v2api('/v2/jobs', { method: 'POST', body: JSON.stringify({ envelope }) });
    assert.equal(created.status, 201);
    const { jobId } = await created.json();

    let job;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      job = (await (await v2api(`/v2/jobs/${jobId}`)).json()).job;
      if (['completed', 'failed', 'cancelled'].includes(job.status)) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    assert.equal(job.status, 'completed');
    assert.match(job.result.stdout, /v2-e2e-ok/);

    const duplicate = await v2api('/v2/jobs', { method: 'POST', body: JSON.stringify({ envelope }) });
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /duplicate idempotencyKey/);

    const { events, head } = await (await v2api('/events?since=0')).json();
    let previous = '';
    for (const { seq, jobId: eventJobId, type, at, chain } of events) {
      assert.equal(chain, sha256Hex(previous + canonicalize({ seq, jobId: eventJobId, type, at })));
      previous = chain;
    }
    assert.equal(head.chain, previous);
    assert.deepEqual(
      events.filter((event) => event.jobId === jobId).map((event) => event.type),
      ['enqueued', 'leased', 'started', 'completed'],
    );
  });

  test('tampered envelopes are refused at the API boundary', async () => {
    const envelope = makeEnvelope({ idempotencyKey: 'e2e-tamper', boundedPrompt: JSON.stringify({ argv: ['x'] }) });
    envelope.boundedPrompt = JSON.stringify({ argv: ['powershell'] }); // tamper after hashing
    const response = await v2api('/v2/jobs', { method: 'POST', body: JSON.stringify({ envelope }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /actionHash/);
  });

  test('routine registration validates schedules and ticks the scheduler', async () => {
    const routine = {
      id: 'rt-1',
      schedule: { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' },
      missedRunPolicy: 'skip',
      envelope: {
        schemaVersion: 1,
        workspaceId: 'ws-1',
        workItemId: 'wi-rt',
        workItemRevision: 1,
        adapter: 'safe-command',
        workingDirectory: workDir,
        boundedPrompt: JSON.stringify({ argv: [process.execPath, '-e', '0'] }),
        allowedExecutables: [],
        verificationPlan: [],
      },
    };
    const response = await v2api('/v2/routines', { method: 'POST', body: JSON.stringify({ routines: [routine] }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.routines, 1);
    assert.deepEqual(body.materialised, [], 'a brand-new routine anchors at now — no backlog');

    const bad = await v2api('/v2/routines', {
      method: 'POST',
      body: JSON.stringify({
        routines: [{ id: 'rt-2', schedule: { kind: 'interval', everyMinutes: 1, startAt: 'nope' }, missedRunPolicy: 'skip', envelope: routine.envelope }],
      }),
    });
    assert.equal(bad.status, 400);
  });
});
