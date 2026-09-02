#!/usr/bin/env node
/**
 * Opt-in real-host smoke: two teammates on the paired runner, in two git
 * worktrees of a throwaway fixture repository that carries one deliberate bug
 * and one failing test. Provider completion is recorded as completed only;
 * the runner's own `node --test` check decides success.
 *
 *   CHERRY_REAL_CODEX=1 CHERRY_REAL_CLAUDE=1 node scripts/god-mode/run-real-host-smoke.mjs \
 *     --codex-command "node,C:\\path\\to\\@openai\\codex\\bin\\codex.js" --claude-command claude
 *
 * Without the environment switches the script runs the mock host only and says
 * so in the capture. Nothing here reads or prints credentials; provider output
 * is redacted by the runner and stored as bounded, hashed excerpts.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, totalmem, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeActionHash } from '../../runner/lib/canonical.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const args = process.argv.slice(2);
const argValue = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const PORT = Number(argValue('--port', '47843'));
const OUT_DIR = resolve(argValue('--out', join(repoRoot, 'docs', 'release')));
const useCodex = process.env.CHERRY_REAL_CODEX === '1';
const useClaude = process.env.CHERRY_REAL_CLAUDE === '1';
const codexCommand = argValue('--codex-command', 'codex');
const claudeCommand = argValue('--claude-command', 'claude');
const token = randomBytes(18).toString('base64url');
const startedAt = new Date().toISOString();

function detailText(details) {
  if (Array.isArray(details)) return details.join('; ').slice(0, 160);
  if (details && typeof details === 'object') return Object.entries(details).map(([key, value]) => `${key}=${String(value)}`).join('; ').slice(0, 160);
  return details ? String(details).slice(0, 160) : '';
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function git(cwd, argv) {
  return execFileSync('git', argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/** Fixture: add() subtracts, and the test says so. No network, no secrets. */
function createFixtureRepo(root) {
  const repo = join(root, 'fixture-repo');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'add.mjs'), "export function add(a, b) {\n  return a - b; // deliberate defect: should add\n}\n");
  writeFileSync(join(repo, 'add.test.mjs'), "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './add.mjs';\n\ntest('add sums two numbers', () => {\n  assert.equal(add(2, 3), 5);\n});\n");
  writeFileSync(join(repo, 'README.md'), '# Fixture\n\nOne module, one failing test. Run `node --test`.\n');
  writeFileSync(join(repo, 'AGENTS.md'), 'Fix only what the failing test describes. Do not touch the test. Do not push.\n');
  git(repo, ['init', '-q']);
  git(repo, ['-c', 'user.email=smoke@cherry.local', '-c', 'user.name=Cherry smoke', 'add', '.']);
  git(repo, ['-c', 'user.email=smoke@cherry.local', '-c', 'user.name=Cherry smoke', 'commit', '-q', '-m', 'fixture with a deliberate defect']);
  return { repo, baseCommit: git(repo, ['rev-parse', 'HEAD']) };
}

function startRunner(root) {
  const argv = [join(repoRoot, 'runner', 'server.mjs'), '--root', root, '--state', join(root, '.state'), '--port', String(PORT), '--concurrency', '3', '--allow-exec', 'node', '--allow-mock-host'];
  if (useCodex) argv.push('--allow-exec', 'codex', '--host-command', `codex=${codexCommand}`);
  if (useClaude) argv.push('--allow-exec', 'claude', '--host-command', `claude=${claudeCommand}`);
  const child = spawn(process.execPath, argv, { env: { ...process.env, CHERRY_RUNNER_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  child.stderr.on('data', (chunk) => { log += chunk.toString(); });
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`runner did not start:\n${log}`)), 20_000);
    const check = setInterval(() => {
      if (log.includes('listening')) {
        clearTimeout(timer);
        clearInterval(check);
        resolvePromise(child);
      }
    }, 100);
    child.on('exit', (code) => { clearInterval(check); reject(new Error(`runner exited early with ${code}:\n${log}`)); });
  });
}

async function api(path, init = {}) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-cherry-pair': token, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function node(id, title, objective, hostKinds, checks, extra = {}) {
  return {
    id, missionId: 'ms-smoke', title, objective,
    definitionOfDone: extra.definitionOfDone ?? ['The checks pass'],
    dependencyIds: [], kind: 'agent', preferredAgentProfileId: null, preferredHostKinds: hostKinds,
    requiredCapabilities: ['repository_read', 'repository_write', 'command_execution'], riskLevel: 'low',
    verificationPlan: checks, contextRefs: [], maxAttempts: 2, timeoutMs: 900_000, sandbox: 'git-worktree',
  };
}

function envelopeFor(plan, planNode, repo, baseCommit, hostKinds, executables) {
  const boundedPrompt = JSON.stringify({
    planId: plan.id, planRevision: plan.revision, planContentHash: plan.contentHash, nodeId: planNode.id, kind: planNode.kind,
    title: planNode.title, objective: planNode.objective, definitionOfDone: planNode.definitionOfDone,
    contextBundleId: null, contextText: readFileSync(join(repo, 'AGENTS.md'), 'utf8'),
    sandbox: { provider: 'git-worktree', sourceRoot: repo, baseRef: baseCommit }, hostKinds,
    outputs: planNode.id === 'review-notes' ? ['artifacts/review.md'] : [],
  });
  const envelope = {
    schemaVersion: 1, workspaceId: 'ws-smoke', workItemId: `wk-${planNode.id}`, workItemRevision: 1, routineId: null, routineRevision: null,
    executionHostId: hostKinds[0], adapter: 'agent-host', workingDirectory: null, boundedPrompt, contextRefs: [],
    requiredCapabilities: planNode.requiredCapabilities, allowedExecutables: executables, allowedOrigins: [], sideEffects: [], dataEgress: [],
    verificationPlan: planNode.verificationPlan.map((check) => JSON.stringify(check)),
    idempotencyKey: `ms-smoke@r1@${planNode.id}`, approvalIntentId: null, createdAt: new Date().toISOString(),
  };
  envelope.actionHash = computeActionHash(envelope);
  return envelope;
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'cherry-real-host-'));
  const { repo, baseCommit } = createFixtureRepo(root);
  const runner = await startRunner(root);
  const capture = { startedAt, commit: git(repoRoot, ['rev-parse', 'HEAD']), machine: { platform: platform(), release: release(), cpu: cpus()[0]?.model ?? 'unknown', memoryGb: Math.round(totalmem() / 1e9), node: process.version }, switches: { CHERRY_REAL_CODEX: useCodex, CHERRY_REAL_CLAUDE: useClaude }, fixture: { repo, baseCommit }, hosts: null, mission: null, events: [], limitations: [] };
  try {
    const hosts = await api('/v2/hosts');
    capture.hosts = hosts.body.hosts ?? [];
    const available = new Set((capture.hosts ?? []).filter((host) => host.available).map((host) => host.hostId));
    const fixKinds = useCodex && available.has('codex') ? ['codex-cli'] : useClaude && available.has('claude') ? ['claude-cli'] : ['local-runner'];
    const reviewKinds = useClaude && available.has('claude') ? ['claude-cli'] : useCodex && available.has('codex') ? ['codex-cli'] : ['local-runner'];
    if (fixKinds[0] === 'local-runner') capture.limitations.push('No real host was available for the fix node; the mock host ran it. This is a rehearsal, not a real-host capture.');
    if (reviewKinds[0] === 'local-runner') capture.limitations.push('No real host was available for the review node; the mock host ran it.');
    const execFor = (kinds) => kinds[0] === 'codex-cli' ? ['codex'] : kinds[0] === 'claude-cli' ? ['claude'] : ['node'];

    const plan = {
      id: 'plan-smoke', workspaceId: 'ws-smoke', missionId: 'ms-smoke', templateId: null,
      outcome: 'Find the failing test in this fixture repository, fix the defect it describes, review the change, and prove it with the tests.',
      constraints: ['Do not edit the test.', 'Do not push.'], status: 'draft', revision: 1, contentHash: '', approvalId: null, nodeWorkItemIds: {},
      createdAt: startedAt, updatedAt: startedAt,
      nodes: [
        node('developer-fix', 'Fix the failing test', 'Run node --test, read the failure, fix add.mjs so the test passes. Do not edit the test file.', fixKinds,
          [{ id: 'tests', kind: 'command', required: true, argv: ['node', '--test'], expectExitCode: 0, description: 'node --test exits 0 in the worker worktree' }]),
        node('review-notes', 'Write a review of the defect', 'Read add.mjs and add.test.mjs, explain the defect, and write artifacts/review.md with a heading "Verdict" and one sentence saying whether the module is correct as it stands. Do not edit code.', reviewKinds,
          [{ id: 'review-exists', kind: 'file_contains', required: true, path: 'artifacts/review.md', contains: 'Verdict', description: 'artifacts/review.md contains a Verdict heading' }],
          { definitionOfDone: ['artifacts/review.md exists with a Verdict'] }),
      ],
    };
    const envelopes = {
      'developer-fix': envelopeFor(plan, plan.nodes[0], repo, baseCommit, fixKinds, execFor(fixKinds)),
      'review-notes': envelopeFor(plan, plan.nodes[1], repo, baseCommit, reviewKinds, execFor(reviewKinds)),
    };
    const registered = await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan, envelopes }) });
    if (registered.status !== 201 && registered.status !== 200) throw new Error(`register failed ${registered.status}: ${JSON.stringify(registered.body)}`);
    const missionRunId = registered.body.missionRunId;
    const started = await api(`/v2/missions/${missionRunId}/start`, { method: 'POST', body: '{}' });
    if (started.status !== 200) throw new Error(`start failed ${started.status}: ${JSON.stringify(started.body)}`);

    const deadline = Date.now() + 25 * 60_000;
    let mission = null;
    for (;;) {
      const current = await api(`/v2/missions/${missionRunId}`);
      mission = current.body.mission;
      process.stdout.write(`\r${new Date().toISOString().slice(11, 19)} mission ${mission.status}: ${Object.entries(mission.nodes).map(([id, entry]) => `${id}=${entry.status}`).join(' ')}   `);
      if (['succeeded', 'failed', 'cancelled'].includes(mission.status)) break;
      if (Date.now() > deadline) { await api(`/v2/missions/${missionRunId}/cancel`, { method: 'POST', body: '{}' }); capture.limitations.push('Timed out after 25 minutes and was cancelled.'); break; }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    }
    process.stdout.write('\n');
    capture.mission = mission;
    const events = await api('/events?since=0');
    capture.events = (events.body.events ?? []).filter((event) => String(event.jobId).startsWith(missionRunId));
    // Parallel proof: walk the event log in order and record how many distinct nodes were running at once.
    const running = new Set();
    let maxConcurrent = 0;
    for (const event of [...capture.events].sort((a, b) => a.seq - b.seq)) {
      const nodeId = String(event.jobId).slice(missionRunId.length + 1);
      if (event.type === 'node_started') running.add(nodeId);
      if (['node_completed', 'node_failed', 'node_succeeded', 'node_cancelled', 'node_verifying'].includes(event.type)) running.delete(nodeId);
      maxConcurrent = Math.max(maxConcurrent, running.size);
    }
    capture.maxConcurrentNodes = maxConcurrent;
    capture.overlap = maxConcurrent >= 2;
  } finally {
    runner.kill();
  }

  mkdirSync(join(OUT_DIR, 'benchmarks'), { recursive: true });
  const jsonPath = join(OUT_DIR, 'benchmarks', 'god-mode-hosts.json');
  const redacted = JSON.parse(JSON.stringify(capture).replace(/(sk|pk|rk|ghp|gho|xoxb|xoxp)-[A-Za-z0-9_-]{10,}/g, '[redacted]'));
  writeFileSync(jsonPath, JSON.stringify(redacted, null, 2) + '\n');
  const nodes = redacted.mission?.nodes ?? {};
  const lines = [
    '# God Mode real-host capture', '',
    `Started ${startedAt} on commit ${redacted.commit.slice(0, 12)} (${redacted.machine.platform} ${redacted.machine.release}, Node ${redacted.machine.node}).`,
    `Switches: CHERRY_REAL_CODEX=${useCodex ? 1 : 0}, CHERRY_REAL_CLAUDE=${useClaude ? 1 : 0}. Fixture repository at a temporary path, base commit ${redacted.fixture.baseCommit.slice(0, 12)}.`, '',
    '## Hosts as the runner probed them', '',
    '| Host | Available | Version | Boundary | Status | Details |', '|---|---|---|---|---|---|',
    ...(redacted.hosts ?? []).map((host) => `| ${host.hostId} | ${host.available} | ${host.version ?? 'unknown'} | ${host.boundary} | ${host.status} | ${detailText(host.details)} |`), '',
    '## Mission', '',
    `Status: **${redacted.mission?.status ?? 'not run'}**. Parallel overlap proven from the event log: **${redacted.overlap ? 'yes' : 'no'}** (at most ${redacted.maxConcurrentNodes ?? 0} distinct nodes were running at the same instant).`, '',
    '| Node | Host | Boundary | Sandbox | Attempts | Evaluation | Last error |', '|---|---|---|---|---|---|---|',
    ...Object.entries(nodes).map(([id, entry]) => `| ${id} | ${entry.host ? `${entry.host.hostId}${entry.host.version ? ` ${entry.host.version}` : ''}` : 'none'} | ${entry.sandbox?.boundary ?? 'none'} | ${entry.sandbox ? `${entry.sandbox.branchName ?? ''} from ${(entry.sandbox.baseCommit ?? '').slice(0, 10)}` : 'none'} | ${entry.attempts} | ${entry.evaluation ? `${entry.evaluation.status}: ${entry.evaluation.checks.map((check) => `${check.name} ${check.status}`).join(', ')}` : 'none'} | ${entry.lastError ?? ''} |`), '',
    '## Event log excerpt', '', '```text',
    ...redacted.events.slice(0, 60).map((event) => `${event.at} ${event.jobId} ${event.type}`), '```', '',
    '## Limitations', '', ...(redacted.limitations.length > 0 ? redacted.limitations.map((line) => `- ${line}`) : ['- None recorded by the script. Provider completion was never treated as success; the runner ran node --test itself.']), '',
    `Raw record: docs/release/benchmarks/god-mode-hosts.json (sha256 ${sha256(JSON.stringify(redacted)).slice(0, 16)}).`, '',
  ];
  writeFileSync(join(OUT_DIR, 'GOD_MODE_REAL_HOST_CAPTURE.md'), lines.join('\n'));
  console.log(`capture written: ${join(OUT_DIR, 'GOD_MODE_REAL_HOST_CAPTURE.md')}`);
  if (!redacted.mission || redacted.mission.status !== 'succeeded') process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
