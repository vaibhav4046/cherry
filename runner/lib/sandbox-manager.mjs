/**
 * SandboxManager: isolated working directories for mission workers.
 *
 * Providers:
 *   directory     an empty directory under the approved root (boundary 'process')
 *   git-worktree  a git worktree on its own branch (boundary 'worktree-process')
 *
 * Path:   <approvedRoot>/.cherry-sandboxes/<safeMissionId>/<safeWorkItemId>/
 * Branch: cherry/mission/<safeMissionId>/<safeWorkItemId>
 *
 * Policy refusals return { ok: false, code, reason } and never throw. Every
 * git call is an argv array with shell:false and a minimal child env, and all
 * git calls run one at a time through a promise chain. The manager never
 * passes --force, never deletes a branch, and never pushes. A worktree that
 * git refuses to remove (uncommitted work) is kept and marked 'retained'.
 * Leases persist to <dataDir>/sandboxes.json.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { loadJson, saveJsonAtomic } from './store.mjs';
import { runProcess } from './adapters.mjs';
import { createPhysicalPathGuard } from './physical-path-guard.mjs';

export const SANDBOX_DIR_NAME = '.cherry-sandboxes';
const SAFE_ID = /^[A-Za-z0-9._-]{1,60}$/;
const PROVIDERS = new Set(['directory', 'git-worktree']);
const ACTIVE_STATUSES = new Set(['ready', 'leased', 'failed']);
const SETTABLE_STATUSES = new Set(['ready', 'leased', 'failed']);
const GIT_TIMEOUT_MS = 60_000;
const DEFAULT_LEASE_TTL_MS = 24 * 60 * 60 * 1000;
const CASE_INSENSITIVE_PATHS = process.platform === 'win32';

/** Returns the id when it is safe for a path segment and a branch segment, else null. */
export function safeSandboxId(value) {
  if (typeof value !== 'string' || !SAFE_ID.test(value) || value.includes('..') || value === '.') return null;
  return value;
}

function comparablePath(path) {
  const resolved = resolve(path);
  return CASE_INSENSITIVE_PATHS ? resolved.toLowerCase() : resolved;
}

function isWithin(candidate, root) {
  const target = comparablePath(candidate);
  const base = comparablePath(root);
  return target === base || target.startsWith(base + sep);
}

function refuse(code, reason, extra = {}) {
  return { ok: false, code, reason, ...extra };
}

async function defaultExec(gitArgs, cwd) {
  return runProcess('git', gitArgs, cwd, { timeoutMs: GIT_TIMEOUT_MS });
}

/** Parse `git worktree list --porcelain` into a map of comparable path -> { prunable }. */
export function parseWorktreeList(text) {
  const entries = new Map();
  let current = null;
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('worktree ')) {
      current = { prunable: false };
      entries.set(comparablePath(trimmed.slice('worktree '.length)), current);
    } else if (trimmed.startsWith('prunable') && current) {
      current.prunable = true;
    } else if (trimmed === '') {
      current = null;
    }
  }
  return entries;
}

export class SandboxManager {
  constructor({ dataDir, allowedRoots, now = () => Date.now(), exec = defaultExec, leaseTtlMs = DEFAULT_LEASE_TTL_MS }) {
    if (!dataDir) throw new Error('SandboxManager requires a dataDir');
    if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) throw new Error('SandboxManager requires allowedRoots');
    this.file = join(dataDir, 'sandboxes.json');
    this.allowedRoots = allowedRoots.map((root) => resolve(root));
    this.pathGuard = createPhysicalPathGuard(this.allowedRoots);
    this.now = now;
    this.exec = exec;
    this.leaseTtlMs = leaseTtlMs;
    this.leases = loadJson(this.file, []);
    if (!Array.isArray(this.leases)) this.leases = [];
    this.chain = Promise.resolve();
  }

  /** Run `task` after every previously queued task settled: git never overlaps. */
  serial(task) {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  save() {
    saveJsonAtomic(this.file, this.leases);
  }

  iso() {
    return new Date(this.now()).toISOString();
  }

  list() {
    return this.leases;
  }

  get(leaseId) {
    return this.leases.find((lease) => lease.id === leaseId) ?? null;
  }

  async git(gitArgs, cwd) {
    try {
      return await this.exec(gitArgs, cwd);
    } catch (error) {
      return { exitCode: -1, stdout: '', stderr: String(error?.message ?? error) };
    }
  }

  async gitOutput(gitArgs, cwd) {
    const run = await this.git(gitArgs, cwd);
    return run.exitCode === 0 ? run.stdout.trim() : null;
  }

  /** The approved root that contains `source`, or null. */
  approvedRootFor(source) {
    try {
      return this.pathGuard.approvedRootFor(source);
    } catch {
      return null;
    }
  }

  allocate(request) {
    return this.serial(() => this.allocateLocked(request ?? {}));
  }

  async allocateLocked({ missionId, workItemId, provider, sourceRoot, baseRef = null, writable = true, retain = false }) {
    if (!PROVIDERS.has(provider)) return refuse('unsupported_provider', `provider must be one of ${[...PROVIDERS].join(', ')}`);
    const safeMissionId = safeSandboxId(missionId);
    const safeWorkItemId = safeSandboxId(workItemId);
    if (!safeMissionId || !safeWorkItemId) {
      return refuse('unsafe_id', 'missionId and workItemId must match [A-Za-z0-9._-], be at most 60 characters, and not contain ".."');
    }
    if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) return refuse('outside_root', 'sourceRoot is required');
    const source = resolve(sourceRoot);
    const approvedRoot = this.approvedRootFor(source);
    if (!approvedRoot) return refuse('outside_root', `sourceRoot ${source} is outside the approved roots`);
    try {
      this.pathGuard.assertPath(source, { root: approvedRoot, mustExist: true, type: 'directory', scanTree: provider === 'git-worktree' });
    } catch (error) {
      if (error?.code === 'symlinked_path') return refuse('symlinked_root', `sourceRoot ${source} passes through a symbolic link or junction`);
      return refuse('missing_root', `sourceRoot ${source} is not a safe existing directory: ${String(error?.message ?? error)}`);
    }

    const root = join(approvedRoot, SANDBOX_DIR_NAME, safeMissionId, safeWorkItemId);
    const holder = this.leases.find((lease) => ACTIVE_STATUSES.has(lease.status) && comparablePath(lease.root) === comparablePath(root));
    if (holder) return refuse('path_in_use', `${root} is held by lease ${holder.id} (${holder.status})`);
    if (existsSync(root)) return refuse('path_exists', `${root} already exists; clean it up under ${SANDBOX_DIR_NAME} before reusing the ids`);
    try {
      this.pathGuard.assertPath(root, { root: approvedRoot });
      this.pathGuard.ensureDirectory(join(approvedRoot, SANDBOX_DIR_NAME, safeMissionId), { root: approvedRoot });
      this.pathGuard.assertPath(root, { root: approvedRoot });
    } catch (error) {
      return refuse(error?.code ?? 'unsafe_path', String(error?.message ?? error));
    }

    let branchName = null;
    let baseCommit = null;
    if (provider === 'git-worktree') {
      if ((await this.gitOutput(['rev-parse', '--is-inside-work-tree'], source)) !== 'true') {
        return refuse('not_a_repository', `${source} is not inside a git working tree`);
      }
      const status = await this.git(['status', '--porcelain', '--untracked-files=no'], source);
      if (status.exitCode !== 0) return refuse('git_failed', `git status failed: ${status.stderr.trim()}`);
      if (status.stdout.trim().length > 0) {
        return refuse('dirty_source', 'the source repository has uncommitted changes to tracked files; commit or stash them first');
      }
      baseCommit = await this.gitOutput(['rev-parse', '--verify', `${baseRef ?? 'HEAD'}^{commit}`], source);
      if (!baseCommit) return refuse('bad_base_ref', `${baseRef ?? 'HEAD'} does not resolve to a commit`);
      branchName = `cherry/mission/${safeMissionId}/${safeWorkItemId}`;
      const existing = await this.git(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], source);
      if (existing.exitCode === 0) return refuse('branch_exists', `branch ${branchName} already exists and belongs to another lease`);
      const added = await this.git(['worktree', 'add', '-b', branchName, root, baseCommit], source);
      if (added.exitCode !== 0) return refuse('git_failed', `git worktree add failed: ${added.stderr.trim()}`);
      try {
        this.pathGuard.assertPath(root, { root: approvedRoot, mustExist: true, type: 'directory', scanTree: true });
      } catch (error) {
        await this.git(['worktree', 'remove', root], source);
        return refuse(error?.code ?? 'unsafe_path', String(error?.message ?? error));
      }
    } else {
      baseCommit = await this.gitOutput(['rev-parse', 'HEAD'], source);
      try {
        this.pathGuard.ensureDirectory(root, { root: approvedRoot });
      } catch (error) {
        return refuse(error?.code ?? 'unsafe_path', String(error?.message ?? error));
      }
    }

    const createdAt = this.iso();
    const lease = {
      id: `sb-${randomBytes(6).toString('hex')}`,
      missionId: safeMissionId,
      workItemId: safeWorkItemId,
      provider,
      sourceRoot: source,
      approvedRoot,
      root,
      branchName,
      baseCommit,
      boundary: provider === 'git-worktree' ? 'worktree-process' : 'process',
      status: 'ready',
      writable: Boolean(writable),
      retain: Boolean(retain),
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(this.now() + this.leaseTtlMs).toISOString(),
      releasedAt: null,
      releaseReason: null,
      retainReason: null,
    };
    this.leases.push(lease);
    this.save();
    return { ok: true, lease };
  }

  /** Mark a lease 'leased' (a worker holds it), 'ready', or 'failed'. */
  setStatus(leaseId, status) {
    const lease = this.get(leaseId);
    if (!lease) return refuse('not_found', `no lease ${leaseId}`);
    if (!SETTABLE_STATUSES.has(status)) return refuse('bad_status', `status must be one of ${[...SETTABLE_STATUSES].join(', ')}`);
    if (!ACTIVE_STATUSES.has(lease.status)) return refuse('not_active', `lease ${leaseId} is ${lease.status}`);
    lease.status = status;
    lease.updatedAt = this.iso();
    this.save();
    return { ok: true, lease };
  }

  /**
   * Commit everything a worker left in a worktree lease onto the lease's own branch
   * (runner logs under .cherry stay out). The source branch is never touched.
   */
  commitAll(leaseId, message) {
    return this.serial(async () => {
      const lease = this.get(leaseId);
      if (!lease) return refuse('not_found', `no lease ${leaseId}`);
      if (lease.provider !== 'git-worktree') return refuse('unsupported_provider', 'only git-worktree leases can commit');
      try {
        this.pathGuard.assertPath(lease.root, { root: lease.approvedRoot, mustExist: true, type: 'directory', scanTree: true });
      } catch (error) {
        return refuse(error?.code ?? 'unsafe_path', String(error?.message ?? error));
      }
      const head = () => this.gitOutput(['rev-parse', 'HEAD'], lease.root);
      const status = await this.git(['status', '--porcelain'], lease.root);
      if (status.exitCode !== 0) return refuse('git_failed', `git status failed: ${status.stderr.trim()}`);
      if (status.stdout.trim().length === 0) return { ok: true, committed: false, commit: await head() };
      const added = await this.git(['add', '-A', '--', '.', ':!.cherry'], lease.root);
      if (added.exitCode !== 0) return refuse('git_failed', `git add failed: ${added.stderr.trim()}`);
      const staged = await this.git(['diff', '--cached', '--quiet'], lease.root);
      if (staged.exitCode === 0) return { ok: true, committed: false, commit: await head() };
      const committed = await this.git(['-c', 'user.email=runner@cherry.local', '-c', 'user.name=Cherry Runner', 'commit', '-q', '-m', String(message ?? 'cherry: worker result').slice(0, 200)], lease.root);
      if (committed.exitCode !== 0) return refuse('git_failed', `git commit failed: ${committed.stderr.trim()}`);
      lease.updatedAt = this.iso();
      this.save();
      return { ok: true, committed: true, commit: await head() };
    });
  }

  release(leaseId, options) {
    return this.serial(() => this.releaseLocked(leaseId, options ?? {}));
  }

  async releaseLocked(leaseId, { reason = 'released' }) {
    const lease = this.get(leaseId);
    if (!lease) return refuse('not_found', `no lease ${leaseId}`);
    if (lease.status === 'leased') return refuse('lease_active', `lease ${leaseId} is still held by a worker`);
    if (!ACTIVE_STATUSES.has(lease.status)) return { ok: true, lease };
    lease.releaseReason = String(reason);
    if (lease.status === 'failed' || lease.retain) {
      lease.retainReason = lease.status === 'failed' ? 'the node failed; the sandbox is kept for inspection' : 'retain was requested';
      lease.status = 'retained';
    } else {
      try {
        this.pathGuard.assertPath(lease.root, {
          root: join(lease.approvedRoot, SANDBOX_DIR_NAME),
          mustExist: true,
          type: 'directory',
          scanTree: true,
        });
      } catch (error) {
        lease.status = 'retained';
        lease.retainReason = `unsafe cleanup refused: ${String(error?.message ?? error)}`;
        lease.releasedAt = this.iso();
        lease.updatedAt = lease.releasedAt;
        this.save();
        return refuse(error?.code ?? 'unsafe_path', lease.retainReason, { lease });
      }
      if (lease.provider === 'git-worktree') {
      const removed = await this.git(['worktree', 'remove', lease.root], lease.sourceRoot);
      if (removed.exitCode === 0) {
        lease.status = 'released';
      } else {
        lease.status = 'retained';
        lease.retainReason = `git kept the worktree: ${removed.stderr.trim() || removed.stdout.trim() || 'unknown reason'}`;
      }
      } else if (isWithin(lease.root, join(lease.approvedRoot, SANDBOX_DIR_NAME))) {
        try {
          this.pathGuard.removeTree(lease.root, { root: join(lease.approvedRoot, SANDBOX_DIR_NAME) });
        lease.status = 'released';
      } catch (error) {
        lease.status = 'retained';
        lease.retainReason = `the directory could not be removed: ${String(error?.message ?? error)}`;
      }
      } else {
        lease.status = 'retained';
        lease.retainReason = `${lease.root} is outside ${SANDBOX_DIR_NAME}; nothing was deleted`;
      }
    }
    lease.releasedAt = this.iso();
    lease.updatedAt = lease.releasedAt;
    this.save();
    return { ok: true, lease };
  }

  /** Reconcile persisted leases with the filesystem and `git worktree list`. */
  recoverAfterRestart() {
    return this.serial(() => this.recoverLocked());
  }

  async recoverLocked() {
    const report = { lost: [], reset: [] };
    const worktreeLists = new Map();
    for (const lease of this.leases) {
      if (!ACTIVE_STATUSES.has(lease.status)) continue;
      let lost = !existsSync(lease.root);
      if (!lost && lease.provider === 'git-worktree') {
        const key = comparablePath(lease.sourceRoot);
        if (!worktreeLists.has(key)) {
          const listed = await this.git(['worktree', 'list', '--porcelain'], lease.sourceRoot);
          worktreeLists.set(key, listed.exitCode === 0 ? parseWorktreeList(listed.stdout) : new Map());
        }
        const entry = worktreeLists.get(key).get(comparablePath(lease.root));
        lost = !entry || entry.prunable;
      }
      if (lost) {
        lease.status = 'lost';
        lease.retainReason = 'the sandbox directory or its git registration disappeared while the runner was stopped';
        report.lost.push(lease.id);
      } else if (lease.status === 'leased') {
        lease.status = 'ready';
        report.reset.push(lease.id);
      } else {
        continue;
      }
      lease.updatedAt = this.iso();
    }
    if (report.lost.length > 0 || report.reset.length > 0) this.save();
    return report;
  }
}
