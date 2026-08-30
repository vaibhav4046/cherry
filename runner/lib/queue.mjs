/**
 * Durable job queue with leases, heartbeats, a bounded worker pool, bounded
 * retry, cancellation, per-job timeout, and crash recovery.
 *
 * Jobs persist atomically to <dataDir>/queue-jobs.json. A job carries an
 * immutable execution envelope; work executes only under a lease
 * {jobId, leaseId, expiresAt}; expired leases return the job to queued.
 * Every state change is appended to the (optional) EventsLog.
 */
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadJson, saveJsonAtomic } from './store.mjs';
import { computeActionHash } from './canonical.mjs';
import { redact } from './redact.mjs';

const DEFAULT_LEASE_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 1_000;

const ACTIVE_STATUSES = new Set(['leased', 'running']);

/** Returns human-readable problems; empty array means the envelope is valid. */
export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return ['envelope must be an object'];
  const problems = [];
  if (envelope.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  for (const field of ['workspaceId', 'workItemId', 'adapter', 'idempotencyKey', 'actionHash', 'createdAt']) {
    if (typeof envelope[field] !== 'string' || envelope[field].length === 0) {
      problems.push(`${field} must be a non-empty string`);
    }
  }
  if (problems.length === 0) {
    try {
      if (computeActionHash(envelope) !== envelope.actionHash) {
        problems.push('actionHash does not match the canonical envelope hash');
      }
    } catch (error) {
      problems.push(`envelope is not canonicalizable: ${error.message}`);
    }
  }
  return problems;
}

export class DurableQueue {
  constructor({
    dataDir,
    events = null,
    now = () => Date.now(),
    concurrency = 1,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    leaseTtlMs = DEFAULT_LEASE_TTL_MS,
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  }) {
    if (!dataDir) throw new Error('DurableQueue requires a dataDir');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
      throw new Error('concurrency must be an integer between 1 and 3');
    }
    this.file = join(dataDir, 'queue-jobs.json');
    this.events = events;
    this.now = now;
    this.concurrency = concurrency;
    this.maxAttempts = maxAttempts;
    this.backoffBaseMs = backoffBaseMs;
    this.leaseTtlMs = leaseTtlMs;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.jobs = loadJson(this.file, []);
    this.active = new Map();
    this.idleWaiters = [];
    this.recoverAfterCrash();
  }

  /** Crash recovery: leases that expired while the process was down requeue. */
  recoverAfterCrash() {
    const nowMs = this.now();
    let changed = false;
    for (const job of this.jobs) {
      const expired = !job.lease || Date.parse(job.lease.expiresAt) <= nowMs;
      if (ACTIVE_STATUSES.has(job.status) && expired) {
        job.status = 'queued';
        job.lease = null;
        this.record(job, 'requeued_after_crash');
        changed = true;
      }
    }
    if (changed) this.save();
  }

  save() {
    saveJsonAtomic(this.file, this.jobs);
  }

  record(job, type) {
    this.events?.append(job.id, type, new Date(this.now()).toISOString());
  }

  getJob(jobId) {
    return this.jobs.find((candidate) => candidate.id === jobId) ?? null;
  }

  list() {
    return this.jobs;
  }

  /**
   * Enqueue an immutable execution envelope. Refuses invalid envelopes and
   * duplicate idempotency keys with a clear reason.
   */
  enqueue(envelope, { timeoutMs } = {}) {
    const problems = validateEnvelope(envelope);
    if (problems.length > 0) {
      return { ok: false, code: 'invalid', reason: problems.join('; ') };
    }
    const duplicate = this.jobs.find((job) => job.envelope.idempotencyKey === envelope.idempotencyKey);
    if (duplicate) {
      return {
        ok: false,
        code: 'duplicate',
        reason: `duplicate idempotencyKey "${envelope.idempotencyKey}": job ${duplicate.id} already exists with status ${duplicate.status}`,
      };
    }
    const job = {
      id: `job-${randomBytes(8).toString('hex')}`,
      envelope,
      status: 'queued',
      attempts: 0,
      notBefore: null,
      lease: null,
      cancelRequested: false,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : null,
      result: null,
      lastError: null,
      createdAt: new Date(this.now()).toISOString(),
    };
    this.jobs.push(job);
    this.record(job, 'enqueued');
    this.save();
    return { ok: true, jobId: job.id };
  }

  /** Lease the next eligible queued job, or null. */
  claim() {
    const nowMs = this.now();
    const job = this.jobs.find(
      (candidate) => candidate.status === 'queued' && (!candidate.notBefore || Date.parse(candidate.notBefore) <= nowMs),
    );
    if (!job) return null;
    const lease = {
      jobId: job.id,
      leaseId: `lease-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(nowMs + this.leaseTtlMs).toISOString(),
    };
    job.status = 'leased';
    job.lease = lease;
    this.record(job, 'leased');
    this.save();
    return { job, lease };
  }

  holdsLease(job, leaseId) {
    return Boolean(job && job.lease && job.lease.leaseId === leaseId && ACTIVE_STATUSES.has(job.status));
  }

  /** Extend the lease of a job the caller still holds. */
  heartbeat(jobId, leaseId) {
    const job = this.getJob(jobId);
    if (!this.holdsLease(job, leaseId)) return false;
    job.lease = { ...job.lease, expiresAt: new Date(this.now() + this.leaseTtlMs).toISOString() };
    this.save();
    return true;
  }

  /** Return jobs with expired leases to the queue (not counted as attempts). */
  expireLeases() {
    const nowMs = this.now();
    let expired = 0;
    for (const job of this.jobs) {
      if (
        ACTIVE_STATUSES.has(job.status) &&
        job.lease &&
        Date.parse(job.lease.expiresAt) <= nowMs &&
        !this.active.has(job.id)
      ) {
        job.status = 'queued';
        job.lease = null;
        this.record(job, 'lease_expired');
        expired += 1;
      }
    }
    if (expired > 0) this.save();
    return expired;
  }

  succeed(jobId, leaseId, result) {
    const job = this.getJob(jobId);
    if (!this.holdsLease(job, leaseId)) return false;
    if (job.cancelRequested) return this.finishCancelled(job);
    job.status = 'completed';
    job.result = result ?? null;
    job.lease = null;
    this.record(job, 'completed');
    this.save();
    return true;
  }

  /** Failure path: bounded retry with exponential backoff, then failed. */
  fail(jobId, leaseId, info) {
    const job = this.getJob(jobId);
    if (!this.holdsLease(job, leaseId)) return false;
    if (job.cancelRequested) return this.finishCancelled(job);
    job.attempts += 1;
    job.lastError = redact(info?.message ?? info?.stderr ?? 'failed');
    job.lease = null;
    if (job.attempts >= this.maxAttempts) {
      job.status = 'failed';
      job.result = info ?? null;
      this.record(job, 'failed');
    } else {
      job.status = 'queued';
      job.notBefore = new Date(this.now() + this.backoffBaseMs * 2 ** (job.attempts - 1)).toISOString();
      this.record(job, 'retry_scheduled');
    }
    this.save();
    return true;
  }

  finishCancelled(job) {
    job.status = 'cancelled';
    job.lease = null;
    this.record(job, 'cancelled');
    this.save();
    return true;
  }

  /** Cancel a queued job immediately; abort a leased/running one. */
  cancel(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;
    if (job.status === 'queued') {
      this.finishCancelled(job);
    } else if (ACTIVE_STATUSES.has(job.status)) {
      job.cancelRequested = true;
      this.save();
      this.active.get(jobId)?.controller.abort(new Error('cancelled'));
    }
    return job;
  }

  // ---------------- worker pool ----------------

  /** Fill the pool up to `concurrency` with eligible jobs. */
  runPending(executor) {
    while (this.active.size < this.concurrency) {
      const claimed = this.claim();
      if (!claimed) break;
      void this.runOne(claimed, executor);
    }
  }

  async runOne({ job, lease }, executor) {
    const controller = new AbortController();
    this.active.set(job.id, { controller });
    job.status = 'running';
    this.record(job, 'started');
    this.save();
    const heartbeatTimer = setInterval(
      () => this.heartbeat(job.id, lease.leaseId),
      Math.max(500, Math.floor(this.leaseTtlMs / 3)),
    );
    heartbeatTimer.unref?.();
    const timeoutMs = job.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutTimer = setTimeout(
      () => controller.abort(new Error(`job timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timeoutTimer.unref?.();
    try {
      const result = await executor(job.envelope, { signal: controller.signal, timeoutMs });
      if (result && result.status === 'completed') {
        this.succeed(job.id, lease.leaseId, result);
      } else {
        this.fail(job.id, lease.leaseId, result ?? { message: 'adapter returned no result' });
      }
    } catch (error) {
      this.fail(job.id, lease.leaseId, { message: String(error?.message ?? error) });
    } finally {
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      this.active.delete(job.id);
      this.runPending(executor);
      if (this.active.size === 0) this.settleIdle();
    }
  }

  /** Resolves when no job is executing and nothing is claimable right now. */
  whenIdle() {
    if (this.active.size === 0) return Promise.resolve();
    return new Promise((resolvePromise) => this.idleWaiters.push(resolvePromise));
  }

  settleIdle() {
    for (const resolvePromise of this.idleWaiters.splice(0)) resolvePromise();
  }
}
