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
import { buildChildEnv, isPythonExecutable } from './lib/process-policy.mjs';
import {
  fetchYouTubeChannelFeed,
  isPublicNetworkAddress,
  parseYouTubeChannelFeed,
  validateYouTubeChannelId,
} from './lib/youtube-rss-watch.mjs';
import {
  computeSourceWatchActionHash,
  createSourceWatchRoutine,
  sourceWatchJobMatchesRoutine,
} from './lib/source-watch.mjs';

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

test('scheduler persists routine definitions and isolates namespace replacement/removal', () => {
  const dir = tempDir('sched-definitions-');
  const schedule = { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' };
  const first = new Scheduler({ dataDir: dir, materialise: () => {} });
  first.setRoutines([{ id: 'ordinary-1', schedule, missedRunPolicy: 'skip' }], 'default');
  first.upsertRoutine({ id: 'rss-watch:source-1', namespace: 'source-watch', schedule, missedRunPolicy: 'run_once_on_reconnect' });

  const restored = new Scheduler({ dataDir: dir, materialise: () => {} });
  assert.deepEqual(restored.listRoutines().map((routine) => routine.id).sort(), ['ordinary-1', 'rss-watch:source-1']);
  restored.setRoutines([{ id: 'ordinary-2', schedule, missedRunPolicy: 'skip' }], 'default');
  assert.deepEqual(restored.listRoutines('source-watch').map((routine) => routine.id), ['rss-watch:source-1']);
  assert.equal(restored.removeRoutine('source-watch', 'rss-watch:source-1'), true);

  const afterRemoval = new Scheduler({ dataDir: dir, materialise: () => {} });
  assert.deepEqual(afterRemoval.listRoutines().map((routine) => routine.id), ['ordinary-2']);
});

// ---------------- 9. YouTube public RSS watch ----------------

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const FEED_FIXTURE = readFileSync(join(here, 'fixtures', 'youtube-channel-feed.xml'), 'utf8');

function feedResponse(body = FEED_FIXTURE, init = {}) {
  const response = new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/atom+xml; charset=utf-8', ...(init.headers ?? {}) },
  });
  Object.defineProperty(response, 'url', { value: init.url ?? FEED_URL });
  return response;
}

test('YouTube RSS accepts only exact UC plus 22-character channel ids', () => {
  assert.equal(validateYouTubeChannelId(CHANNEL_ID), true);
  for (const value of [
    'abcdefghijklmnopqrstuv',
    'UCabcdefghijklmnopqrstu',
    'UCabcdefghijklmnopqrstuvw',
    'ucabcdefghijklmnopqrstuv',
    'UCabcdefghijklmnopqrstu!',
  ]) assert.equal(validateYouTubeChannelId(value), false, value);
});

test('YouTube RSS DNS guard rejects private and IPv4-mapped private addresses', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ]) assert.equal(isPublicNetworkAddress(address), false, address);
  assert.equal(isPublicNetworkAddress('142.250.74.238'), true);
  assert.equal(isPublicNetworkAddress('2607:f8b0:4004:c08::5b'), true);
});

test('YouTube RSS parser returns bounded transcriptless entries and a feed hash', () => {
  const result = parseYouTubeChannelFeed(FEED_FIXTURE, CHANNEL_ID, { now: () => Date.parse('2026-09-01T09:00:00.000Z') });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.channelId, CHANNEL_ID);
  assert.equal(result.checkedAt, '2026-09-01T09:00:00.000Z');
  assert.equal(result.channelName, 'Cherry Source Lab');
  assert.match(result.feedHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.entries, [
    {
      videoId: 'AbCdEfGhI12',
      title: 'Build & ship a reliable workflow',
      url: 'https://www.youtube.com/watch?v=AbCdEfGhI12',
      publishedAt: '2026-08-31T08:00:00.000Z',
    },
    {
      videoId: 'ZyXwVuTsR98',
      title: 'Evidence before automation',
      url: 'https://www.youtube.com/watch?v=ZyXwVuTsR98',
      publishedAt: '2026-08-30T09:15:00.000Z',
    },
  ]);
  assert.equal(JSON.stringify(result).includes('description'), false);
  assert.equal(JSON.stringify(result).includes('transcript'), false);

  const liveResult = parseYouTubeChannelFeed(
    FEED_FIXTURE.replace('/shorts/ZyXwVuTsR98', '/live/ZyXwVuTsR98'),
    CHANNEL_ID,
  );
  assert.equal(liveResult.entries[1].url, 'https://www.youtube.com/watch?v=ZyXwVuTsR98');
});

test('YouTube RSS output stays within the browser contract caps', () => {
  const longChannel = 'C'.repeat(240);
  const longTitle = 'T'.repeat(340);
  const bounded = FEED_FIXTURE
    .replace('Cherry Source Lab', longChannel)
    .replace('Build &amp; ship a reliable workflow', longTitle);
  const result = parseYouTubeChannelFeed(bounded, CHANNEL_ID);
  assert.equal(result.channelName, 'C'.repeat(200));
  assert.equal(result.entries[0].title, 'T'.repeat(300));

  const entryTemplate = FEED_FIXTURE.match(/ {2}<entry>[\s\S]*?<\/entry>/)?.[0];
  assert.ok(entryTemplate);
  const entries = Array.from({ length: 16 }, (_, index) => {
    const videoId = `VidId${String(index).padStart(6, '0')}`;
    return entryTemplate
      .replaceAll('AbCdEfGhI12', videoId)
      .replace('Build &amp; ship a reliable workflow', `Video ${index}`);
  }).join('\n');
  const overCap = FEED_FIXTURE.replace(/ {2}<entry>[\s\S]*?<\/entry>\s* {2}<entry>[\s\S]*?<\/entry>/, entries);
  assert.throws(() => parseYouTubeChannelFeed(overCap, CHANNEL_ID), /more than 15 entries/);
});

test('YouTube RSS fetch preflights public DNS and uses the one fixed URL without redirects', async () => {
  const calls = [];
  const result = await fetchYouTubeChannelFeed(CHANNEL_ID, {
    lookup: async (hostname, options) => {
      calls.push({ kind: 'lookup', hostname, options });
      return [{ address: '142.250.74.238', family: 4 }];
    },
    request: async (url, init) => {
      calls.push({ kind: 'request', url, init });
      return feedResponse();
    },
    now: () => Date.parse('2026-09-01T09:00:00.000Z'),
  });
  assert.equal(result.channelId, CHANNEL_ID);
  assert.equal(calls[0].hostname, 'www.youtube.com');
  assert.equal(calls[1].url, FEED_URL);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.redirect, 'error');
});

test('YouTube RSS timeout also bounds a stalled DNS preflight', async () => {
  const guarded = Promise.race([
    fetchYouTubeChannelFeed(CHANNEL_ID, { lookup: () => new Promise(() => {}), timeoutMs: 10 }),
    new Promise((resolvePromise, rejectPromise) => setTimeout(() => rejectPromise(new Error('test guard expired')), 100)),
  ]);
  await assert.rejects(guarded, /timed out/);
});

test('YouTube RSS fails closed before fetch on private DNS and after fetch on unsafe responses', async (t) => {
  let requested = false;
  await assert.rejects(
    () => fetchYouTubeChannelFeed(CHANNEL_ID, {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      request: async () => { requested = true; return feedResponse(); },
    }),
    /public address/,
  );
  assert.equal(requested, false);

  const publicLookup = async () => [{ address: '2607:f8b0:4004:c08::5b', family: 6 }];
  await t.test('final origin mismatch', async () => {
    await assert.rejects(
      () => fetchYouTubeChannelFeed(CHANNEL_ID, { lookup: publicLookup, request: async () => feedResponse(FEED_FIXTURE, { url: 'https://example.com/feed.xml' }) }),
      /final URL/,
    );
  });
  await t.test('wrong content type', async () => {
    await assert.rejects(
      () => fetchYouTubeChannelFeed(CHANNEL_ID, { lookup: publicLookup, request: async () => feedResponse(FEED_FIXTURE, { headers: { 'content-type': 'text/html' } }) }),
      /content type/,
    );
  });
  await t.test('body over configured cap', async () => {
    await assert.rejects(
      () => fetchYouTubeChannelFeed(CHANNEL_ID, { lookup: publicLookup, request: async () => feedResponse(FEED_FIXTURE), maxBytes: 100 }),
      /body limit/,
    );
  });
  await t.test('DTD or entity declaration', () => {
    assert.throws(
      () => parseYouTubeChannelFeed(`<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY x "expanded">]><feed>&x;</feed>`, CHANNEL_ID),
      /DTD|entity declaration/,
    );
  });
  await t.test('malformed XML', () => {
    assert.throws(() => parseYouTubeChannelFeed(FEED_FIXTURE.replace('</entry>', '</broken>'), CHANNEL_ID), /malformed XML/);
  });
  await t.test('channel mismatch', () => {
    assert.throws(() => parseYouTubeChannelFeed(FEED_FIXTURE, 'UCzyxwvutsrqponmlkjihgfe'), /channel does not match/);
  });
});

test('source-watch approval hash uses exactly the cross-layer payload and derives a bounded routine', () => {
  const definition = {
    channelId: CHANNEL_ID,
    revision: 2,
    schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
    sourceId: 'source-1',
    workspaceId: 'workspace-1',
  };
  const actionHash = computeSourceWatchActionHash(definition);
  assert.equal(actionHash, sha256Hex(canonicalize(definition)));
  const routine = createSourceWatchRoutine({ ...definition, actionHash });
  assert.equal(routine.id, 'rss-watch:source-1');
  assert.equal(routine.namespace, 'source-watch');
  assert.equal(routine.missedRunPolicy, 'run_once_on_reconnect');
  assert.equal(routine.envelope.adapter, 'youtube-rss-watch');
  assert.deepEqual(JSON.parse(routine.envelope.boundedPrompt), {
    actionHash,
    channelId: CHANNEL_ID,
    sourceId: 'source-1',
    workspaceId: 'workspace-1',
  });
  assert.throws(() => createSourceWatchRoutine({ ...definition, actionHash: '0'.repeat(64) }), /actionHash/);
});

test('source-watch job matching requires the exact revision, bounded prompt, and immutable envelope hash', () => {
  const definition = {
    channelId: CHANNEL_ID,
    revision: 4,
    schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
    sourceId: 'source-job-binding-1',
    workspaceId: 'workspace-job-binding-1',
  };
  const routine = createSourceWatchRoutine({ ...definition, actionHash: computeSourceWatchActionHash(definition) });
  const envelope = {
    ...routine.envelope,
    idempotencyKey: 'source-job-binding-key',
    createdAt: '2026-09-01T09:00:00.000Z',
  };
  envelope.actionHash = computeActionHash(envelope);
  assert.equal(sourceWatchJobMatchesRoutine({ envelope }, routine), true);
  assert.equal(sourceWatchJobMatchesRoutine({ envelope: { ...envelope, workItemRevision: 3 } }, routine), false);
  assert.equal(sourceWatchJobMatchesRoutine({ envelope: { ...envelope, boundedPrompt: '{}' } }, routine), false);
  assert.equal(sourceWatchJobMatchesRoutine({ envelope: { ...envelope, actionHash: '0'.repeat(64) } }, routine), false);
});

test('youtube-rss-watch adapter binds normalized stdout to the approved watch', async () => {
  const definition = {
    channelId: CHANNEL_ID,
    revision: 1,
    schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
    sourceId: 'source-adapter-1',
    workspaceId: 'workspace-adapter-1',
  };
  const routine = createSourceWatchRoutine({ ...definition, actionHash: computeSourceWatchActionHash(definition) });
  const envelope = {
    ...routine.envelope,
    idempotencyKey: 'rss-adapter-1',
    createdAt: '2026-09-01T09:00:00.000Z',
  };
  envelope.actionHash = computeActionHash(envelope);
  const adapters = createAdapters({
    allowedRoots: [tempDir('rss-adapter-')],
    allowedExecutables: new Set(),
    youtubeRssOptions: {
      lookup: async () => [{ address: '142.250.74.238', family: 4 }],
      request: async () => feedResponse(),
      now: () => Date.parse('2026-09-01T09:00:00.000Z'),
    },
  });
  const result = await adapters.run(envelope, { timeoutMs: 10_000 });
  const stdout = JSON.parse(result.stdout);
  assert.deepEqual(stdout, result.feed);
  assert.deepEqual(Object.keys(stdout), [
    'schemaVersion', 'watchId', 'actionHash', 'channelId', 'checkedAt', 'channelName', 'feedHash', 'entries',
  ]);
  assert.equal(stdout.watchId, definition.sourceId);
  assert.equal(stdout.actionHash, computeSourceWatchActionHash(definition));
  assert.equal(stdout.entries[0].url, 'https://www.youtube.com/watch?v=AbCdEfGhI12');
  assert.equal(JSON.stringify(stdout).includes('description'), false);
  assert.equal(JSON.stringify(stdout).includes('transcript'), false);
});

// ---------------- 10. adapters ----------------

test('child process policy keeps runtime plumbing but removes secrets and injection hooks', () => {
  const childEnv = buildChildEnv({
    Path: 'C:\\runtime',
    SystemRoot: 'C:\\Windows',
    TEMP: 'C:\\Temp',
    LANG: 'en_GB.UTF-8',
    CHERRY_RUNNER_TOKEN: 'runner-secret',
    OPENAI_API_KEY: 'api-secret',
    AMBIENT_SECRET: 'ambient-secret',
    NODE_OPTIONS: '--require attacker.js',
    PYTHONPATH: 'C:\\attacker',
  });
  assert.equal(childEnv.Path, 'C:\\runtime');
  assert.equal(childEnv.SystemRoot, 'C:\\Windows');
  assert.equal(childEnv.LANG, 'en_GB.UTF-8');
  for (const key of ['CHERRY_RUNNER_TOKEN', 'OPENAI_API_KEY', 'AMBIENT_SECRET', 'NODE_OPTIONS', 'PYTHONPATH']) {
    assert.equal(childEnv[key], undefined);
  }
  for (const executable of ['python', 'python3', 'python3.11', 'python.exe', 'C:\\Python311\\python.exe', '/usr/bin/python3']) {
    assert.equal(isPythonExecutable(executable), true, executable);
  }
  assert.equal(isPythonExecutable(process.execPath), false);
});

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

test('safe-command reserves Python for the fixed Scrapling worker', async () => {
  const root = tempDir('ad-python-reserved-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(['python']) });
  const envelope = makeEnvelope({
    workingDirectory: root,
    boundedPrompt: JSON.stringify({ argv: ['python', '-c', 'print(1)'] }),
  });
  await assert.rejects(() => adapters.run(envelope), /Python.*reserved.*Scrapling/i);
});

test('safe-command child cannot read runner or ambient secrets', async () => {
  const root = tempDir('ad-env-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set([process.execPath]) });
  const previousToken = process.env.CHERRY_RUNNER_TOKEN;
  const previousSecret = process.env.CHERRY_TEST_SECRET;
  process.env.CHERRY_RUNNER_TOKEN = 'runner-token-sentinel';
  process.env.CHERRY_TEST_SECRET = 'ambient-secret-sentinel';
  try {
    const envelope = makeEnvelope({
      workingDirectory: root,
      boundedPrompt: JSON.stringify({ argv: [process.execPath, '-e', "console.log(JSON.stringify({token:process.env.CHERRY_RUNNER_TOKEN,secret:process.env.CHERRY_TEST_SECRET,path:Boolean(process.env.PATH||process.env.Path)}))"] }),
    });
    const result = await adapters.run(envelope);
    assert.deepEqual(JSON.parse(result.stdout), { path: true });
  } finally {
    if (previousToken === undefined) delete process.env.CHERRY_RUNNER_TOKEN;
    else process.env.CHERRY_RUNNER_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.CHERRY_TEST_SECRET;
    else process.env.CHERRY_TEST_SECRET = previousSecret;
  }
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
      ['cherry-export', 'cherry-verify', 'claude-cli', 'codex-cli', 'safe-command', 'scrapling-fetch', 'youtube-rss-watch'].sort(),
    );
  });

  test('default CORS accepts only the exact production origin', async () => {
    const official = await fetch(`${V2_BASE}/status`, { headers: { origin: 'https://cherry-wine.vercel.app' } });
    assert.equal(official.status, 200);
    assert.equal(official.headers.get('access-control-allow-origin'), 'https://cherry-wine.vercel.app');
    const lookalike = await fetch(`${V2_BASE}/status`, { headers: { origin: 'https://sub.cherry-wine.vercel.app' } });
    assert.equal(lookalike.status, 403);
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

  test('generic v2 jobs and routines cannot invoke the reserved channel-watch adapter', async () => {
    const definition = {
      channelId: CHANNEL_ID,
      revision: 1,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'source-reserved-1',
      workspaceId: 'workspace-reserved-1',
    };
    const routine = createSourceWatchRoutine({ ...definition, actionHash: computeSourceWatchActionHash(definition) });
    const envelope = {
      ...routine.envelope,
      idempotencyKey: 'reserved-generic-job',
      createdAt: '2026-09-01T09:00:00.000Z',
    };
    envelope.actionHash = computeActionHash(envelope);
    const jobResponse = await v2api('/v2/jobs', { method: 'POST', body: JSON.stringify({ envelope }) });
    assert.equal(jobResponse.status, 400);
    assert.match((await jobResponse.json()).error, /reserved.*channel-watch/i);

    const genericRoutine = { ...routine, id: 'generic-rss-routine', namespace: 'default' };
    const routineResponse = await v2api('/v2/routines', {
      method: 'POST',
      body: JSON.stringify({ routines: [genericRoutine] }),
    });
    assert.equal(routineResponse.status, 400);
    assert.match((await routineResponse.json()).error, /reserved.*channel-watch/i);
  });

  test('generic timed routines are disabled until an approval-bound registration exists', async () => {
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
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /approval-bound.*disabled/i);

    const cleared = await v2api('/v2/routines', { method: 'POST', body: JSON.stringify({ routines: [] }) });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), { routines: 0, materialised: [] });
  });

  test('runner restart purges persisted generic routines but preserves approved channel watches', async () => {
    const port = 47833;
    const base = `http://127.0.0.1:${port}`;
    const token = 'v2-routine-migration-token-0123456789';
    const root = tempDir('cherry-v2-routine-migration-');
    const state = join(root, '.state');
    const dataDir = join(state, 'v2');
    mkdirSync(dataDir, { recursive: true });
    const watchDefinition = {
      channelId: CHANNEL_ID,
      revision: 1,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'source-migration-1',
      workspaceId: 'workspace-migration-1',
    };
    const sourceWatch = createSourceWatchRoutine({
      ...watchDefinition,
      actionHash: computeSourceWatchActionHash(watchDefinition),
    });
    const generic = {
      id: 'legacy-generic-routine',
      namespace: 'default',
      schedule: { kind: 'interval', everyMinutes: 5, startAt: '2026-01-01T00:00:00.000Z' },
      missedRunPolicy: 'skip',
      envelope: makeEnvelope({ idempotencyKey: undefined, actionHash: undefined }),
    };
    writeFileSync(join(dataDir, 'scheduler-routines.json'), JSON.stringify([generic, sourceWatch]));

    const processHandle = spawn(process.execPath, [
      join(here, 'server.mjs'), '--root', root, '--state', state, '--port', String(port),
    ], { env: { ...process.env, CHERRY_RUNNER_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          if ((await fetch(`${base}/status`)).ok) break;
        } catch {
          // Keep waiting for the local runner.
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      const persisted = JSON.parse(readFileSync(join(dataDir, 'scheduler-routines.json'), 'utf8'));
      assert.deepEqual(persisted.map((routine) => routine.id), [sourceWatch.id]);
    } finally {
      if (processHandle.exitCode === null) {
        const exited = new Promise((resolvePromise) => processHandle.once('exit', resolvePromise));
        processHandle.kill('SIGKILL');
        await exited;
      }
    }
  });

  test('channel-watch routes require the current workspace, revision, and approval hash', async () => {
    const revisionOne = {
      channelId: CHANNEL_ID,
      revision: 1,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'source-http-1',
      workspaceId: 'workspace-http-1',
    };
    const tampered = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionOne, actionHash: '0'.repeat(64) }),
    });
    assert.equal(tampered.status, 400);
    assert.match((await tampered.json()).error, /actionHash/);

    const actionHashOne = computeSourceWatchActionHash(revisionOne);
    const registered = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionOne, actionHash: actionHashOne }),
    });
    assert.equal(registered.status, 201);
    assert.deepEqual(await registered.json(), { routineId: 'rss-watch:source-http-1', actionHash: actionHashOne });
    const replayed = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionOne, actionHash: actionHashOne }),
    });
    assert.equal(replayed.status, 201, 'an exact retry is idempotent');
    const workspaceTakeover = { ...revisionOne, workspaceId: 'another-workspace', revision: 10 };
    const refusedTakeover = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...workspaceTakeover, actionHash: computeSourceWatchActionHash(workspaceTakeover) }),
    });
    assert.equal(refusedTakeover.status, 409);

    const wrongWorkspace = await v2api(`/v2/channel-watches/source-http-1/jobs?workspaceId=another-workspace&revision=1&actionHash=${actionHashOne}`);
    assert.equal(wrongWorkspace.status, 409);
    const refusedCheck = await v2api('/v2/channel-watches/source-http-1/check', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'workspace-http-1', revision: 2, actionHash: actionHashOne }),
    });
    assert.equal(refusedCheck.status, 409);

    const firstCheck = await v2api('/v2/channel-watches/source-http-1/check', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'workspace-http-1', revision: 1, actionHash: actionHashOne }),
    });
    assert.equal(firstCheck.status, 201);
    const firstJobId = (await firstCheck.json()).jobId;

    const revisionTwo = {
      ...revisionOne,
      revision: 2,
      schedule: { ...revisionOne.schedule, startAt: '2026-09-01T08:01:00.000Z' },
    };
    const actionHashTwo = computeSourceWatchActionHash(revisionTwo);
    const updated = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionTwo, actionHash: actionHashTwo }),
    });
    assert.equal(updated.status, 201);
    let supersededJob;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      supersededJob = (await (await v2api(`/v2/jobs/${firstJobId}`)).json()).job;
      if (supersededJob.status === 'cancelled') break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }
    assert.equal(supersededJob.status, 'cancelled', 'a newer revision aborts work for the prior approval');

    const missingBinding = await v2api('/v2/channel-watches/source-http-1/jobs?workspaceId=workspace-http-1');
    assert.equal(missingBinding.status, 409);
    const matching = await v2api(`/v2/channel-watches/source-http-1/jobs?workspaceId=workspace-http-1&revision=2&actionHash=${actionHashTwo}`);
    assert.equal(matching.status, 200);
    assert.deepEqual((await matching.json()).jobs, [], 'jobs from revision 1 are hidden from revision 2');
    const secondCheck = await v2api('/v2/channel-watches/source-http-1/check', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'workspace-http-1', revision: 2, actionHash: actionHashTwo }),
    });
    assert.equal(secondCheck.status, 201);
    const secondJobId = (await secondCheck.json()).jobId;
    const thirdCheck = await v2api('/v2/channel-watches/source-http-1/check', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: 'workspace-http-1', revision: 2, actionHash: actionHashTwo }),
    });
    assert.equal(thirdCheck.status, 201);
    const thirdJobId = (await thirdCheck.json()).jobId;
    const currentJobs = await v2api(`/v2/channel-watches/source-http-1/jobs?workspaceId=workspace-http-1&revision=2&actionHash=${actionHashTwo}`);
    assert.deepEqual((await currentJobs.json()).jobs.map((job) => job.id), [secondJobId, thirdJobId]);

    const stale = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionOne, actionHash: actionHashOne }),
    });
    assert.equal(stale.status, 409);
    const nonMonotonicDefinition = {
      ...revisionTwo,
      channelId: 'UCzyxwvutsrqponmlkjihgfe',
    };
    const nonMonotonic = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...nonMonotonicDefinition, actionHash: computeSourceWatchActionHash(nonMonotonicDefinition) }),
    });
    assert.equal(nonMonotonic.status, 409);

    const wrongDelete = await v2api(`/v2/channel-watches/source-http-1?workspaceId=workspace-http-1&revision=2&actionHash=${actionHashOne}`, { method: 'DELETE' });
    assert.equal(wrongDelete.status, 409);
    const removed = await v2api(`/v2/channel-watches/source-http-1?workspaceId=workspace-http-1&revision=2&actionHash=${actionHashTwo}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).cancelledJobs, 2);
    for (const cancelledJobId of [secondJobId, thirdJobId]) {
      let cancelledJob;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        cancelledJob = (await (await v2api(`/v2/jobs/${cancelledJobId}`)).json()).job;
        if (cancelledJob.status === 'cancelled') break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      }
      assert.equal(cancelledJob.status, 'cancelled');
    }

    for (const rejectedDefinition of [revisionOne, revisionTwo]) {
      const rejected = await v2api('/v2/channel-watches', {
        method: 'POST',
        body: JSON.stringify({ ...rejectedDefinition, actionHash: computeSourceWatchActionHash(rejectedDefinition) }),
      });
      assert.equal(rejected.status, 409);
    }
    const revisionThree = { ...revisionTwo, revision: 3 };
    const actionHashThree = computeSourceWatchActionHash(revisionThree);
    const resurrected = await v2api('/v2/channel-watches', {
      method: 'POST',
      body: JSON.stringify({ ...revisionThree, actionHash: actionHashThree }),
    });
    assert.equal(resurrected.status, 201);
  });

  test('channel-watch deletion tombstones survive runner restart', async () => {
    const port = 47832;
    const base = `http://127.0.0.1:${port}`;
    const token = 'v2-tombstone-token-0123456789';
    const root = tempDir('cherry-v2-tombstone-');
    const state = join(root, '.state');
    const api = (path, options = {}) => fetch(`${base}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-cherry-pair': token, ...(options.headers ?? {}) },
    });
    const start = async () => {
      const processHandle = spawn(process.execPath, [
        join(here, 'server.mjs'), '--root', root, '--state', state, '--port', String(port),
      ], { env: { ...process.env, CHERRY_RUNNER_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          if ((await fetch(`${base}/status`)).ok) return processHandle;
        } catch {
          // Keep waiting for the local runner.
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      processHandle.kill('SIGKILL');
      throw new Error('tombstone runner did not start');
    };
    const stop = async (processHandle) => {
      if (processHandle.exitCode !== null) return;
      const exited = new Promise((resolvePromise) => processHandle.once('exit', resolvePromise));
      processHandle.kill('SIGKILL');
      await exited;
    };
    const baseDefinition = {
      channelId: CHANNEL_ID,
      revision: 5,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'source-restart-1',
      workspaceId: 'workspace-restart-1',
    };
    const actionHashFive = computeSourceWatchActionHash(baseDefinition);

    let processHandle = await start();
    try {
      assert.equal((await api('/v2/channel-watches', {
        method: 'POST', body: JSON.stringify({ ...baseDefinition, actionHash: actionHashFive }),
      })).status, 201);
      assert.equal((await api(`/v2/channel-watches/source-restart-1?workspaceId=workspace-restart-1&revision=5&actionHash=${actionHashFive}`, {
        method: 'DELETE',
      })).status, 200);
    } finally {
      await stop(processHandle);
    }

    processHandle = await start();
    try {
      const replay = await api('/v2/channel-watches', {
        method: 'POST', body: JSON.stringify({ ...baseDefinition, actionHash: actionHashFive }),
      });
      assert.equal(replay.status, 409);
      const revisionFour = { ...baseDefinition, revision: 4 };
      const older = await api('/v2/channel-watches', {
        method: 'POST', body: JSON.stringify({ ...revisionFour, actionHash: computeSourceWatchActionHash(revisionFour) }),
      });
      assert.equal(older.status, 409);
      const revisionSix = { ...baseDefinition, revision: 6 };
      const actionHashSix = computeSourceWatchActionHash(revisionSix);
      const newer = await api('/v2/channel-watches', {
        method: 'POST', body: JSON.stringify({ ...revisionSix, actionHash: actionHashSix }),
      });
      assert.equal(newer.status, 201);
    } finally {
      await stop(processHandle);
    }
  });
});
