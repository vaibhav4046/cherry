/**
 * SandboxManager tests: directory and git-worktree providers over a real
 * temporary git repository, policy refusals, retention, serialized git, and
 * restart reconciliation. Imported by runner.test.mjs.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SandboxManager, safeSandboxId } from './lib/sandbox-manager.mjs';

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

function git(cwd, ...gitArgs) {
  const run = spawnSync('git', ['-c', 'user.name=Cherry Test', '-c', 'user.email=cherry-test@example.com', ...gitArgs], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (run.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

/** A fresh repository with one commit, living under its own approved root. */
function makeRepo(prefix = 'sb-repo-') {
  const root = tempDir(prefix);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '.');
  writeFileSync(join(repo, 'README.md'), 'fixture repository\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-q', '-m', 'init');
  return { root, repo, head: git(repo, 'rev-parse', 'HEAD') };
}

function makeManager(root, overrides = {}) {
  return new SandboxManager({ dataDir: join(root, '.data'), allowedRoots: [root], ...overrides });
}

function worktreePaths(repo) {
  return git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length)).toLowerCase());
}

test('safe ids allow [A-Za-z0-9._-] up to 60 characters and nothing else', () => {
  assert.equal(safeSandboxId('ms-1.a_b'), 'ms-1.a_b');
  assert.equal(safeSandboxId('a'.repeat(60)), 'a'.repeat(60));
  for (const value of ['', 'a'.repeat(61), '..', 'a..b', '.', 'bad id!', 'a/b', 'a\\b', 42, null]) {
    assert.equal(safeSandboxId(value), null, JSON.stringify(value));
  }
});

test('directory provider allocates a safe path under .cherry-sandboxes with the process boundary', async () => {
  const { root, repo, head } = makeRepo();
  const manager = makeManager(root);
  const outcome = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'directory', sourceRoot: repo });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const { lease } = outcome;
  assert.equal(lease.root, join(root, '.cherry-sandboxes', 'ms-1', 'wi-1'));
  assert.equal(lease.boundary, 'process');
  assert.equal(lease.status, 'ready');
  assert.equal(lease.branchName, null);
  assert.equal(lease.baseCommit, head, 'base commit is recorded from the source repository');
  assert.ok(existsSync(lease.root));
  assert.equal(manager.get(lease.id).root, lease.root);
});

test('unsafe mission or work item ids are refused without throwing', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  for (const [missionId, workItemId] of [['../escape', 'wi'], ['ms', 'a/../b'], ['ms', 'wi 1'], ['x'.repeat(61), 'wi'], ['', 'wi']]) {
    const outcome = await manager.allocate({ missionId, workItemId, provider: 'directory', sourceRoot: repo });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, 'unsafe_id');
  }
  assert.equal(manager.list().length, 0);
  assert.equal(existsSync(join(root, '.cherry-sandboxes')), false);
});

test('git-worktree provider records the base commit and creates the mission branch', async () => {
  const { root, repo, head } = makeRepo();
  const manager = makeManager(root);
  const outcome = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const { lease } = outcome;
  assert.equal(lease.boundary, 'worktree-process');
  assert.equal(lease.branchName, 'cherry/mission/ms-1/wi-1');
  assert.equal(lease.baseCommit, head);
  assert.equal(lease.root, join(root, '.cherry-sandboxes', 'ms-1', 'wi-1'));
  assert.ok(existsSync(join(lease.root, 'README.md')));
  assert.equal(git(lease.root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'cherry/mission/ms-1/wi-1');
  assert.ok(worktreePaths(repo).includes(lease.root.toLowerCase()));
});

test('two work items get different paths and branches', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  const first = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  const second = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-2', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.lease.root, second.lease.root);
  assert.notEqual(first.lease.branchName, second.lease.branchName);
  assert.notEqual(first.lease.id, second.lease.id);
});

test('the same branch requested twice is refused, also after the first lease was released', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  const first = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(first.ok, true);
  const again = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'path_in_use');

  const released = await manager.release(first.lease.id, { reason: 'test' });
  assert.equal(released.ok, true);
  const afterRelease = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(afterRelease.ok, false);
  assert.equal(afterRelease.code, 'branch_exists', 'a branch owned by another lease is never reused');
  assert.equal(manager.list().filter((lease) => lease.status === 'ready').length, 0);
});

test('source roots outside the approved roots and symlinked roots are refused', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  const outside = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'directory', sourceRoot: tmpdir() });
  assert.equal(outside.ok, false);
  assert.equal(outside.code, 'outside_root');
  const traversal = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'directory', sourceRoot: join(root, '..') });
  assert.equal(traversal.ok, false);
  assert.equal(traversal.code, 'outside_root');
  const missing = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'directory', sourceRoot: join(root, 'nope') });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing_root');

  const linkPath = join(root, 'linked-repo');
  let linked = false;
  try {
    symlinkSync(repo, linkPath, 'junction');
    linked = true;
  } catch {
    /* symlink creation is not permitted on this account; the refusal is covered by lstat */
  }
  if (linked) {
    const symlinked = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'directory', sourceRoot: linkPath });
    assert.equal(symlinked.ok, false);
    assert.equal(symlinked.code, 'symlinked_root');
  }
});

test('dirty tracked files in the source repository refuse a worktree; untracked files are fine', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  writeFileSync(join(repo, 'scratch.txt'), 'untracked is fine\n');
  const untracked = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(untracked.ok, true, JSON.stringify(untracked));
  writeFileSync(join(repo, 'README.md'), 'modified tracked file\n');
  const dirty = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-2', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(dirty.ok, false);
  assert.equal(dirty.code, 'dirty_source');
});

test('a lease marked failed is retained on release and stays registered with git', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  const { lease } = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(manager.setStatus(lease.id, 'failed').ok, true);
  const released = await manager.release(lease.id, { reason: 'node failed' });
  assert.equal(released.ok, true);
  assert.equal(released.lease.status, 'retained');
  assert.equal(released.lease.releaseReason, 'node failed');
  assert.ok(existsSync(join(lease.root, 'README.md')), 'the worktree is kept for inspection');
  assert.ok(worktreePaths(repo).includes(lease.root.toLowerCase()));

  const retainFlag = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-2', provider: 'directory', sourceRoot: repo, retain: true });
  const retained = await manager.release(retainFlag.lease.id, { reason: 'done' });
  assert.equal(retained.lease.status, 'retained');
  assert.ok(existsSync(retainFlag.lease.root));
});

test('release of a ready lease removes the worktree without --force and releases a directory sandbox', async () => {
  const { root, repo } = makeRepo();
  const calls = [];
  const manager = makeManager(root, {
    exec: async (gitArgs, cwd) => {
      calls.push(gitArgs);
      const run = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', windowsHide: true });
      return { exitCode: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
    },
  });
  const { lease } = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  const released = await manager.release(lease.id, { reason: 'succeeded' });
  assert.equal(released.ok, true, JSON.stringify(released));
  assert.equal(released.lease.status, 'released');
  assert.equal(existsSync(lease.root), false);
  assert.ok(!worktreePaths(repo).includes(lease.root.toLowerCase()));
  assert.ok(calls.every((gitArgs) => !gitArgs.includes('--force') && !gitArgs.includes('-f') && !gitArgs.includes('-D') && !gitArgs.includes('push')));

  const directory = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-dir', provider: 'directory', sourceRoot: repo });
  writeFileSync(join(directory.lease.root, 'out.txt'), 'x');
  const directoryReleased = await manager.release(directory.lease.id, { reason: 'succeeded' });
  assert.equal(directoryReleased.lease.status, 'released');
  assert.equal(existsSync(directory.lease.root), false);

  const dirtyWorktree = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-2', provider: 'git-worktree', sourceRoot: repo });
  writeFileSync(join(dirtyWorktree.lease.root, 'work.txt'), 'uncommitted work\n');
  const kept = await manager.release(dirtyWorktree.lease.id, { reason: 'succeeded' });
  assert.equal(kept.ok, true);
  assert.equal(kept.lease.status, 'retained', 'git refuses to remove a dirty worktree and the runner never forces it');
  assert.ok(existsSync(join(dirtyWorktree.lease.root, 'work.txt')));
});

test('cleanup is refused while the lease is active', async () => {
  const { root, repo } = makeRepo();
  const manager = makeManager(root);
  const { lease } = await manager.allocate({ missionId: 'ms-1', workItemId: 'wi-1', provider: 'git-worktree', sourceRoot: repo });
  assert.equal(manager.setStatus(lease.id, 'leased').ok, true);
  const refused = await manager.release(lease.id, { reason: 'too early' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'lease_active');
  assert.equal(manager.get(lease.id).status, 'leased');
  assert.ok(existsSync(lease.root));
  assert.equal(manager.setStatus(lease.id, 'bogus').ok, false);
  assert.equal((await manager.release('sb-missing', { reason: 'x' })).code, 'not_found');
});

test('git operations are serialized: five concurrent allocations never overlap', async () => {
  const { root, repo } = makeRepo();
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const manager = makeManager(root, {
    exec: async (gitArgs, cwd) => {
      inFlight += 1;
      calls += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      const run = spawnSync('git', gitArgs, { cwd, encoding: 'utf8', windowsHide: true });
      inFlight -= 1;
      return { exitCode: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
    },
  });
  const outcomes = await Promise.all(
    [1, 2, 3, 4, 5].map((index) =>
      manager.allocate({ missionId: 'ms-1', workItemId: `wi-${index}`, provider: 'git-worktree', sourceRoot: repo }),
    ),
  );
  assert.ok(outcomes.every((outcome) => outcome.ok), JSON.stringify(outcomes));
  assert.equal(new Set(outcomes.map((outcome) => outcome.lease.root)).size, 5);
  assert.ok(calls >= 5);
  assert.equal(peak, 1, 'no two git calls overlap');
});

test('recoverAfterRestart reconciles persisted leases with git worktree list', async () => {
  const { root, repo } = makeRepo();
  const first = new SandboxManager({ dataDir: join(root, '.data'), allowedRoots: [root] });
  const kept = await first.allocate({ missionId: 'ms-1', workItemId: 'wi-keep', provider: 'git-worktree', sourceRoot: repo });
  const gone = await first.allocate({ missionId: 'ms-1', workItemId: 'wi-gone', provider: 'git-worktree', sourceRoot: repo });
  const busy = await first.allocate({ missionId: 'ms-1', workItemId: 'wi-busy', provider: 'directory', sourceRoot: repo });
  first.setStatus(busy.lease.id, 'leased');
  rmSync(gone.lease.root, { recursive: true, force: true });

  const restarted = new SandboxManager({ dataDir: join(root, '.data'), allowedRoots: [root] });
  assert.equal(restarted.list().length, 3, 'leases are loaded from sandboxes.json');
  const report = await restarted.recoverAfterRestart();
  assert.equal(restarted.get(kept.lease.id).status, 'ready');
  assert.equal(restarted.get(gone.lease.id).status, 'lost');
  assert.equal(restarted.get(busy.lease.id).status, 'ready', 'a lease held by a dead worker is ready again');
  assert.deepEqual(report.lost, [gone.lease.id]);
  assert.deepEqual(report.reset, [busy.lease.id]);
});
