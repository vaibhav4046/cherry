/**
 * Mission plan validation and MissionExecutor tests: fixtures, parallel
 * overlap, the concurrency cap, dependency order, evaluation and repair,
 * crash recovery, cancellation, human decisions, registration refusals, and
 * the HTTP wiring of /v2/hosts and /v2/missions. Imported by runner.test.mjs.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, computeActionHash, sha256Hex } from './lib/canonical.mjs';
import { EventsLog } from './lib/events.mjs';
import { DurableQueue } from './lib/queue.mjs';
import { createAdapters } from './lib/adapters.mjs';
import { SandboxManager } from './lib/sandbox-manager.mjs';
import {
  PLAN_HASH_FIELDS,
  computePlanContentHash,
  computeReadyNodeIds,
  derivePlanStatus,
  planTopologicalOrder,
  validateMissionPlan,
} from './lib/mission-plan.mjs';
import { MissionExecutor } from './lib/mission-executor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '..', 'tests', 'fixtures', 'mission-plans');
const tempDirs = [];
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

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

const readFixture = (file) => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));

// ---------------- plan model ----------------

test('every mission plan fixture validates to exactly the expected problem codes', () => {
  const index = readFixture('index.json');
  assert.ok(index.fixtures.length >= 20);
  for (const { file, expectedProblemCodes } of index.fixtures) {
    const problems = validateMissionPlan(readFixture(file));
    assert.deepEqual([...new Set(problems.map((problem) => problem.code))].sort(), [...expectedProblemCodes].sort(), file);
    for (const problem of problems) {
      assert.equal(typeof problem.message, 'string', file);
      assert.ok('nodeId' in problem, file);
    }
  }
});

test('topological order respects dependencies, throws on cycles, and the content hash is canonical', () => {
  const release = readFixture('valid-release.json');
  const order = planTopologicalOrder(release);
  assert.equal(order.length, release.nodes.length);
  for (const node of release.nodes) {
    for (const dependency of node.dependencyIds) assert.ok(order.indexOf(dependency) < order.indexOf(node.id), `${dependency} before ${node.id}`);
  }
  assert.throws(() => planTopologicalOrder(readFixture('cycle.json')), /cycle/);

  const hash = computePlanContentHash(release);
  assert.match(hash, /^[a-f0-9]{64}$/);
  const picked = Object.fromEntries(PLAN_HASH_FIELDS.map((field) => [field, release[field]]));
  assert.equal(hash, sha256Hex(canonicalize(picked)), 'sha256 over canonical JSON of PLAN_HASH_FIELDS');
  assert.equal(computePlanContentHash({ ...release, contentHash: 'ignored', status: 'running', approvalId: 'ap-1' }), hash, 'non-hashed fields do not change the hash');
  assert.notEqual(computePlanContentHash({ ...release, outcome: 'different' }), hash);
  assert.notEqual(computePlanContentHash({ ...release, revision: 2 }), hash);
});

test('ready nodes and plan status derive from node statuses', () => {
  const plan = readFixture('valid-two-parallel.json');
  assert.deepEqual(computeReadyNodeIds(plan, { a: 'pending', b: 'pending', c: 'pending' }), ['a', 'b']);
  assert.deepEqual(computeReadyNodeIds(plan, { a: 'succeeded', b: 'running', c: 'pending' }), []);
  assert.deepEqual(computeReadyNodeIds(plan, { a: 'succeeded', b: 'succeeded', c: 'pending' }), ['c']);
  assert.equal(derivePlanStatus(plan, { a: 'succeeded', b: 'succeeded', c: 'succeeded' }, 'running'), 'succeeded');
  assert.equal(derivePlanStatus(plan, { a: 'succeeded', b: 'waiting_for_human', c: 'pending' }, 'running'), 'waiting_for_human');
  assert.equal(derivePlanStatus(plan, { a: 'cancelled', b: 'succeeded', c: 'blocked' }, 'running'), 'cancelled');
  assert.equal(derivePlanStatus(plan, { a: 'failed', b: 'succeeded', c: 'blocked' }, 'running'), 'failed');
  assert.equal(derivePlanStatus(plan, { a: 'failed', b: 'running', c: 'pending' }, 'running'), 'running', 'a failure with work still running is not final');
  assert.equal(derivePlanStatus(plan, { a: 'verifying', b: 'succeeded', c: 'pending' }, 'running'), 'verifying');
  assert.equal(derivePlanStatus(plan, { a: 'ready', b: 'pending', c: 'pending' }, 'running'), 'running');
  assert.equal(derivePlanStatus(plan, { a: 'pending', b: 'pending', c: 'pending' }, 'ready'), 'ready');
});

// ---------------- executor harness ----------------

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

function planNode(id, { deps = [], kind = 'agent', checks = null, maxAttempts = 1, sandbox = 'directory', timeoutMs = 10_000, missionId = 'ms-x', hostKinds = [] } = {}) {
  const verificationPlan = checks ?? (kind === 'human_decision'
    ? [{ id: `${id}-human`, kind: 'human', required: true, description: 'A person decides' }]
    : [{ id: `${id}-check`, kind: 'file', required: true, path: `out/${id}.txt`, description: `${id} output exists` }]);
  return {
    id,
    missionId,
    title: `Node ${id}`,
    objective: `Do ${id}`,
    definitionOfDone: [`${id} is done`],
    dependencyIds: deps,
    kind,
    preferredAgentProfileId: null,
    preferredHostKinds: hostKinds,
    requiredCapabilities: kind === 'human_decision' ? ['human_approval'] : ['repository_read'],
    riskLevel: 'low',
    verificationPlan,
    contextRefs: [],
    maxAttempts,
    timeoutMs,
    sandbox: kind === 'human_decision' ? 'none' : sandbox,
  };
}

function makePlan(nodes, { id = 'plan-1', revision = 1, missionId = 'ms-x', workspaceId = 'ws-1', outcome = 'Run the fixture mission' } = {}) {
  const plan = {
    id,
    workspaceId,
    missionId,
    templateId: null,
    outcome,
    constraints: ['Do not push'],
    nodes: nodes.map((node) => ({ ...node, missionId })),
    status: 'ready',
    revision,
    contentHash: '',
    approvalId: null,
    nodeWorkItemIds: {},
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
  };
  plan.contentHash = computePlanContentHash(plan);
  return plan;
}

function envelopeFor(plan, node, { mock = null, sourceRoot, adapter = 'mock-host', workspaceId = plan.workspaceId } = {}) {
  const envelope = {
    schemaVersion: 1,
    workspaceId,
    workItemId: `wi-${node.id}`,
    workItemRevision: 1,
    routineId: null,
    routineRevision: null,
    executionHostId: 'any',
    adapter,
    workingDirectory: null,
    boundedPrompt: JSON.stringify({
      planId: plan.id,
      planRevision: plan.revision,
      planContentHash: plan.contentHash,
      nodeId: node.id,
      kind: node.kind,
      title: node.title,
      objective: node.objective,
      definitionOfDone: node.definitionOfDone,
      contextBundleId: null,
      contextText: '',
      sandbox: { provider: node.sandbox, sourceRoot },
      hostKinds: node.preferredHostKinds,
      outputs: [`out/${node.id}.txt`],
      ...(mock ? { mock } : {}),
    }),
    contextRefs: [],
    requiredCapabilities: node.requiredCapabilities,
    allowedExecutables: ['node'],
    allowedOrigins: [],
    sideEffects: [],
    dataEgress: [],
    verificationPlan: node.verificationPlan.map((check) => JSON.stringify(check)),
    idempotencyKey: `${plan.missionId}@r${plan.revision}@${node.id}`,
    approvalIntentId: null,
    createdAt: '2026-09-02T12:00:00.000Z',
  };
  envelope.actionHash = computeActionHash(envelope);
  return envelope;
}

const writes = (id, { sleepMs = 0, exitCode = 0 } = {}) => ({ attempts: [{ writeFiles: { [`out/${id}.txt`]: id }, sleepMs, exitCode }] });

function makeHarness({ concurrency = 3, repairBudget = 1 } = {}) {
  const root = tempDir('mx-');
  const source = join(root, 'src');
  mkdirSync(source);
  const dataDir = join(root, '.data');
  const events = new EventsLog(join(dataDir, 'events.log'));
  const queue = new DurableQueue({ dataDir, events, concurrency });
  const sandboxes = new SandboxManager({ dataDir, allowedRoots: [root] });
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), allowMockHost: true, searchPath: false });
  const executor = new MissionExecutor({ dataDir, queue, events, sandboxes, hosts: adapters.hosts, adapters, repairBudget });
  const harness = { root, source, dataDir, events, queue, sandboxes, adapters, executor };
  harness.envelopes = (plan, mocks = {}) => Object.fromEntries(
    plan.nodes.filter((node) => node.kind !== 'human_decision').map((node) => [node.id, envelopeFor(plan, node, { mock: mocks[node.id] ?? writes(node.id), sourceRoot: source })]),
  );
  harness.reopen = () => {
    const events2 = new EventsLog(join(dataDir, 'events.log'));
    const queue2 = new DurableQueue({ dataDir, events: events2, concurrency });
    const sandboxes2 = new SandboxManager({ dataDir, allowedRoots: [root] });
    const adapters2 = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), allowMockHost: true, searchPath: false });
    const executor2 = new MissionExecutor({ dataDir, queue: queue2, events: events2, sandboxes: sandboxes2, hosts: adapters2.hosts, adapters: adapters2, repairBudget });
    return { ...harness, events: events2, queue: queue2, sandboxes: sandboxes2, adapters: adapters2, executor: executor2 };
  };
  return harness;
}

async function settle(harness, missionRunId, { timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await harness.executor.tick();
    const mission = harness.executor.get(missionRunId);
    if (TERMINAL.has(mission.status) || mission.status === 'waiting_for_human') return mission;
    if (Date.now() > deadline) {
      throw new Error(`mission did not settle: ${mission.status} ${JSON.stringify(Object.fromEntries(Object.entries(mission.nodes).map(([id, node]) => [id, node.status])))}`);
    }
    await harness.queue.whenIdle();
    await sleep(10);
  }
}

const nodeStatuses = (mission) => Object.fromEntries(Object.entries(mission.nodes).map(([id, node]) => [id, node.status]));
const eventsOf = (harness, missionRunId) => harness.events.readAll().filter((event) => event.jobId === missionRunId || event.jobId.startsWith(`${missionRunId}:`));
const indexOfEvent = (events, nodeId, type) => events.findIndex((event) => event.jobId.endsWith(`:${nodeId}`) && event.type === type);
const countEvents = (events, nodeId, type) => events.filter((event) => event.jobId.endsWith(`:${nodeId}`) && event.type === type).length;

async function registerAndStart(harness, plan, mocks) {
  const registered = harness.executor.register({ plan, envelopes: harness.envelopes(plan, mocks) });
  assert.equal(registered.ok, true, JSON.stringify(registered));
  const started = harness.executor.start(registered.missionRunId);
  assert.equal(started.ok, true, JSON.stringify(started));
  return registered.missionRunId;
}

// ---------------- executor behaviour ----------------

test('two ready nodes run in parallel on different sandboxes, provable from the events log', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a'), planNode('b')]);
  const missionRunId = await registerAndStart(harness, plan, { a: writes('a', { sleepMs: 150 }), b: writes('b', { sleepMs: 150 }) });
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  const events = eventsOf(harness, missionRunId);
  const startedA = indexOfEvent(events, 'a', 'node_started');
  const startedB = indexOfEvent(events, 'b', 'node_started');
  const completedA = indexOfEvent(events, 'a', 'node_completed');
  const completedB = indexOfEvent(events, 'b', 'node_completed');
  assert.ok(startedA >= 0 && startedB >= 0 && completedA >= 0 && completedB >= 0);
  assert.ok(Math.max(startedA, startedB) < Math.min(completedA, completedB), 'both nodes started before either completed');
  assert.notEqual(mission.nodes.a.sandbox.root, mission.nodes.b.sandbox.root);
  assert.equal(mission.nodes.a.sandbox.root, join(harness.root, '.cherry-sandboxes', missionRunId, 'wi-a'), 'sandboxes are keyed by the mission run');
  assert.equal(mission.nodes.a.sandbox.boundary, 'process');
  assert.equal(readFileSync(join(mission.nodes.a.sandbox.root, 'out', 'a.txt'), 'utf8'), 'a');
  assert.equal(events[0].type, 'mission_started');
  assert.ok(events.some((event) => event.type === 'sandbox_leased'));
  assert.ok(events.some((event) => event.type === 'sandbox_released'));
  assert.equal(mission.nodes.a.evaluation.status, 'passed');
});

test('at most three nodes run at once when four are ready', async () => {
  const harness = makeHarness({ concurrency: 3 });
  const plan = makePlan([planNode('a'), planNode('b'), planNode('c'), planNode('d')]);
  const mocks = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, writes(id, { sleepMs: 120 })]));
  const missionRunId = await registerAndStart(harness, plan, mocks);
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  let running = 0;
  let peak = 0;
  for (const event of eventsOf(harness, missionRunId)) {
    if (event.type === 'node_started') running += 1;
    if (event.type === 'node_completed') running -= 1;
    peak = Math.max(peak, running);
  }
  assert.equal(peak, 3, 'the fourth node waited for a slot');
});

test('a dependent node starts only after every dependency succeeded', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a'), planNode('b'), planNode('c', { deps: ['a', 'b'] })]);
  const missionRunId = await registerAndStart(harness, plan, { a: writes('a', { sleepMs: 60 }), b: writes('b', { sleepMs: 120 }) });
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  const events = eventsOf(harness, missionRunId);
  const startedC = indexOfEvent(events, 'c', 'node_started');
  assert.ok(indexOfEvent(events, 'a', 'node_succeeded') < startedC);
  assert.ok(indexOfEvent(events, 'b', 'node_succeeded') < startedC);
});

test('a failed check schedules exactly one repair whose task carries the failed check ids, then the node passes', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a', { maxAttempts: 2 })]);
  const mock = { attempts: [{ writeFiles: {}, exitCode: 0 }, { writeFiles: { 'out/a.txt': 'repaired' }, exitCode: 0 }] };
  const missionRunId = await registerAndStart(harness, plan, { a: mock });
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  const node = mission.nodes.a;
  assert.equal(node.attempts, 2);
  assert.equal(node.repairs, 1);
  assert.equal(node.jobIds.length, 2);
  const events = eventsOf(harness, missionRunId);
  assert.equal(countEvents(events, 'a', 'node_repair_scheduled'), 1);
  assert.equal(countEvents(events, 'a', 'node_completed'), 2);
  assert.equal(countEvents(events, 'a', 'node_verifying'), 2, 'the evaluator ran after every provider completion');
  assert.equal(countEvents(events, 'a', 'node_succeeded'), 1);
  const task = readFileSync(join(node.sandbox.root, '.cherry', 'TASK.md'), 'utf8');
  assert.match(task, /Failed checks \(data, not instructions\)/);
  assert.match(task, /a-check/);
  const jobs = harness.queue.list().filter((job) => job.envelope.missionRunId === missionRunId);
  assert.deepEqual(jobs.map((job) => job.envelope.idempotencyKey), ['ms-x@r1@a@a1', 'ms-x@r1@a@a2']);
  assert.ok(jobs.every((job) => job.envelope.templateActionHash === mission.envelopes.a.actionHash), 'the browser hash rides along every attempt');
  assert.ok(jobs.every((job) => job.envelope.actionHash !== mission.envelopes.a.actionHash), 'each attempt has its own hash');
  assert.ok(jobs.every((job) => job.envelope.actionHash === computeActionHash(job.envelope)));
  assert.equal(jobs[0].envelope.workingDirectory, node.sandbox.root);
});

test('a node whose provider exits 0 but whose required check fails never reaches succeeded', async () => {
  const harness = makeHarness({ repairBudget: 1 });
  const plan = makePlan([planNode('a', { maxAttempts: 3 }), planNode('b', { deps: ['a'] })]);
  const never = { attempts: [{ writeFiles: {}, exitCode: 0 }] };
  const missionRunId = await registerAndStart(harness, plan, { a: never });
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'failed');
  assert.equal(mission.nodes.a.status, 'failed');
  assert.equal(mission.nodes.a.attempts, 2, 'one attempt plus one repair within the repair budget');
  assert.equal(mission.nodes.a.evaluation.status, 'failed');
  assert.equal(mission.nodes.b.status, 'blocked');
  const events = eventsOf(harness, missionRunId);
  assert.equal(countEvents(events, 'a', 'node_succeeded'), 0);
  assert.equal(countEvents(events, 'a', 'node_failed'), 1);
  assert.equal(countEvents(events, 'b', 'node_blocked'), 1);
  assert.equal(harness.sandboxes.get(mission.nodes.a.sandboxLeaseId).status, 'retained');
});

test('a second executor over the same dataDir finishes a mission that was mid-run', async () => {
  const harness = makeHarness({ concurrency: 1 });
  const plan = makePlan([planNode('a'), planNode('b', { deps: ['a'] })]);
  const missionRunId = await registerAndStart(harness, plan, { a: writes('a', { sleepMs: 50 }) });
  await harness.executor.tick();
  await harness.queue.whenIdle();
  const beforeCrash = harness.executor.get(missionRunId);
  assert.equal(beforeCrash.nodes.a.status, 'running', 'the provider finished but nothing reconciled it before the crash');
  assert.equal(harness.queue.getJob(beforeCrash.nodes.a.currentJobId).status, 'completed');

  const reopened = harness.reopen();
  const recovered = reopened.executor.get(missionRunId);
  assert.equal(recovered.status, 'running');
  const mission = await settle(reopened, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  assert.equal(mission.nodes.a.attempts, 1, 'the finished attempt was reused, not re-run');
  const events = eventsOf(reopened, missionRunId);
  assert.equal(countEvents(events, 'a', 'node_started'), 1);
  assert.equal(countEvents(events, 'a', 'node_succeeded'), 1);
  assert.equal(countEvents(events, 'b', 'node_succeeded'), 1);
  assert.deepEqual(reopened.events.verify(), { ok: true, length: reopened.events.readAll().length });
});

test('event sequence numbers are monotonic and the chain verifies', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a'), planNode('b', { deps: ['a'] })]);
  const missionRunId = await registerAndStart(harness, plan);
  await settle(harness, missionRunId);
  const all = harness.events.readAll();
  for (let index = 1; index < all.length; index += 1) assert.ok(all[index].seq > all[index - 1].seq);
  assert.equal(harness.events.verify().ok, true);
  const events = eventsOf(harness, missionRunId);
  const orderA = ['node_ready', 'node_started', 'node_completed', 'node_verifying', 'node_succeeded'];
  const seenA = events.filter((event) => event.jobId === `${missionRunId}:a` && orderA.includes(event.type)).map((event) => event.type);
  assert.deepEqual(seenA, orderA);
});

test('cancel propagates to running jobs and marks the remaining nodes cancelled', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a'), planNode('b', { deps: ['a'] })]);
  const missionRunId = await registerAndStart(harness, plan, { a: writes('a', { sleepMs: 5000 }) });
  await harness.executor.tick();
  for (let attempt = 0; attempt < 100 && indexOfEvent(eventsOf(harness, missionRunId), 'a', 'node_started') < 0; attempt += 1) await sleep(20);
  assert.ok(indexOfEvent(eventsOf(harness, missionRunId), 'a', 'node_started') >= 0, 'node a started');
  const startedAt = Date.now();
  const cancelled = harness.executor.cancel(missionRunId);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.mission.status, 'cancelled');
  await harness.queue.whenIdle();
  await harness.executor.tick();
  assert.ok(Date.now() - startedAt < 4000, 'the sleeping mock was aborted');
  const mission = harness.executor.get(missionRunId);
  assert.deepEqual(nodeStatuses(mission), { a: 'cancelled', b: 'cancelled' });
  assert.equal(harness.queue.getJob(mission.nodes.a.currentJobId).status, 'cancelled');
  const events = eventsOf(harness, missionRunId);
  assert.equal(countEvents(events, 'a', 'node_cancelled'), 1);
  assert.equal(countEvents(events, 'b', 'node_cancelled'), 1);
  assert.ok(events.some((event) => event.jobId === missionRunId && event.type === 'mission_status'));
  assert.equal(harness.executor.cancel(missionRunId).ok, true, 'cancel is idempotent');
});

test('a human decision parks the mission until decide records the approval', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a'), planNode('h', { kind: 'human_decision', deps: ['a'] }), planNode('b', { deps: ['h'] })]);
  const missionRunId = await registerAndStart(harness, plan);
  const waiting = await settle(harness, missionRunId);
  assert.equal(waiting.status, 'waiting_for_human');
  assert.deepEqual(nodeStatuses(waiting), { a: 'succeeded', h: 'waiting_for_human', b: 'pending' });

  const wrongHash = harness.executor.decide(missionRunId, { nodeId: 'h', decision: 'approve', approvalId: 'ap-1', contentHash: 'f'.repeat(64) });
  assert.equal(wrongHash.ok, false);
  assert.equal(wrongHash.code, 'hash_mismatch');
  assert.equal(harness.executor.decide(missionRunId, { nodeId: 'a', decision: 'approve', approvalId: 'ap-1', contentHash: plan.contentHash }).code, 'not_waiting');
  assert.equal(harness.executor.decide(missionRunId, { nodeId: 'h', decision: 'maybe', approvalId: 'ap-1', contentHash: plan.contentHash }).code, 'bad_decision');
  assert.equal(harness.executor.decide(missionRunId, { nodeId: 'h', decision: 'approve', approvalId: '', contentHash: plan.contentHash }).code, 'approval_required');

  const approved = harness.executor.decide(missionRunId, { nodeId: 'h', decision: 'approve', approvalId: 'ap-1', contentHash: plan.contentHash });
  assert.equal(approved.ok, true, JSON.stringify(approved));
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  assert.deepEqual(mission.nodes.h.decision, { decision: 'approved', approvalId: 'ap-1', contentHash: plan.contentHash, at: mission.nodes.h.decision.at });
  // The decision is the node's evaluation, so a mirror never has to mark a decided node succeeded without a report.
  assert.equal(mission.nodes.h.evaluation.status, 'passed');
  assert.deepEqual(mission.nodes.h.evaluation.checks.map((check) => [check.id, check.status]), [['h-human', 'passed']]);
  assert.match(mission.nodes.h.evaluation.checks[0].detail, /approved by a person \(approval ap-1\)/);
  assert.deepEqual(mission.nodes.h.evaluation.requiredIds, ['h-human']);
  const events = eventsOf(harness, missionRunId);
  assert.equal(countEvents(events, 'h', 'node_waiting_for_human'), 1);
  assert.ok(indexOfEvent(events, 'h', 'node_succeeded') < indexOfEvent(events, 'b', 'node_started'));

  const rejecting = makeHarness();
  const rejectPlan = makePlan([planNode('h', { kind: 'human_decision' }), planNode('b', { deps: ['h'] })], { id: 'plan-reject' });
  const rejectId = await registerAndStart(rejecting, rejectPlan);
  await settle(rejecting, rejectId);
  const rejected = rejecting.executor.decide(rejectId, { nodeId: 'h', decision: 'rejected', approvalId: '', contentHash: rejectPlan.contentHash });
  assert.equal(rejected.ok, true, 'a rejection needs no approval id');
  assert.equal(rejecting.executor.get(rejectId).nodes.h.decision.decision, 'rejected');
  const failed = await settle(rejecting, rejectId);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(nodeStatuses(failed), { h: 'failed', b: 'blocked' });
  assert.equal(failed.nodes.h.evaluation.status, 'failed');
  assert.deepEqual(failed.nodes.h.evaluation.checks.map((check) => [check.id, check.status, check.detail]), [['h-human', 'failed', 'rejected by a person']]);
});

test('a browser-style agent-host envelope with hostKinds local-runner runs on the mock host without a script', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a', { hostKinds: ['local-runner'], maxAttempts: 2 }), planNode('b', { deps: ['a'], hostKinds: ['local-runner'] })]);
  const envelopes = Object.fromEntries(plan.nodes.map((node) => [node.id, envelopeFor(plan, node, { adapter: 'agent-host', sourceRoot: harness.source })]));
  assert.ok(!envelopes.a.boundedPrompt.includes('"mock"'), 'no mock script in the envelope');
  const registered = harness.executor.register({ plan, envelopes });
  assert.equal(registered.ok, true, JSON.stringify(registered));
  harness.executor.start(registered.missionRunId);
  const mission = await settle(harness, registered.missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  assert.equal(readFileSync(join(mission.nodes.a.sandbox.root, 'out', 'a.txt'), 'utf8'), 'written by the mock host for a attempt 1\n');
  assert.deepEqual(mission.nodes.a.host, { hostId: 'mock', kind: 'mock', version: 'mock' });
  assert.equal(mission.nodes.a.attempts, 1);
  assert.deepEqual(Object.keys(mission.nodes.a.sandbox).sort(), ['baseCommit', 'basedOn', 'boundary', 'branchName', 'headCommit', 'id', 'provider', 'root', 'status']);
  assert.equal(mission.nodes.a.evaluation.status, 'passed');
  assert.equal(mission.nodes.b.status, 'succeeded');
});

test('a sandbox provider without a sourceRoot fails the node with a clear reason', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a', { sandbox: 'git-worktree' })]);
  const envelopes = { a: envelopeFor(plan, plan.nodes[0], { sourceRoot: null }) };
  const registered = harness.executor.register({ plan, envelopes });
  assert.equal(registered.ok, true, JSON.stringify(registered));
  harness.executor.start(registered.missionRunId);
  const mission = await settle(harness, registered.missionRunId);
  assert.equal(mission.status, 'failed');
  assert.equal(mission.nodes.a.status, 'failed');
  assert.match(mission.nodes.a.lastError, /git-worktree sandbox but its envelope names no sourceRoot/);
  assert.equal(mission.nodes.a.sandbox, null);
  assert.equal(mission.nodes.a.attempts, 0);
});

test('a directory sandbox without a sourceRoot gets an empty scratch root inside the approved root and still succeeds', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a', { sandbox: 'directory' })]);
  const envelopes = { a: envelopeFor(plan, plan.nodes[0], { sourceRoot: null, mock: writes('a') }) };
  const registered = harness.executor.register({ plan, envelopes });
  assert.equal(registered.ok, true, JSON.stringify(registered));
  harness.executor.start(registered.missionRunId);
  const mission = await settle(harness, registered.missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(mission.nodes.a));
  assert.equal(mission.nodes.a.sandbox.provider, 'directory');
  assert.equal(mission.nodes.a.sandbox.boundary, 'process');
  assert.match(mission.nodes.a.sandbox.root, /\.cherry-sandboxes/);
  const lease = harness.sandboxes.list().find((entry) => entry.id === mission.nodes.a.sandbox.id);
  assert.ok(lease, 'the lease is recorded');
  assert.match(lease.sourceRoot, /\.cherry-scratch/);
  assert.ok(lease.sourceRoot.startsWith(harness.root), 'the scratch root stays inside the approved root');
});

test('a dependant receives the artifacts its dependencies produced, at the same relative paths', async () => {
  const harness = makeHarness();
  const plan = makePlan([
    planNode('a'),
    planNode('b', {
      deps: ['a'],
      checks: [
        { id: 'b-own', kind: 'file', required: true, path: 'out/b.txt', description: 'b output exists' },
        { id: 'b-sees-a', kind: 'file_contains', required: true, path: 'out/a.txt', contains: 'a', description: 'the dependency output is visible to b' },
      ],
    }),
  ]);
  const missionRunId = await registerAndStart(harness, plan, {});
  const mission = await settle(harness, missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  assert.deepEqual(mission.nodes.a.artifacts.map((artifact) => artifact.path), ['out/a.txt']);
  assert.equal(mission.nodes.a.artifacts[0].sha256.length, 64);
  assert.deepEqual(mission.nodes.b.inputs.map((input) => [input.from, input.path]), [['a', 'out/a.txt']]);
  assert.notEqual(mission.nodes.a.sandbox.root, mission.nodes.b.sandbox.root);
  assert.equal(readFileSync(join(mission.nodes.b.sandbox.root, 'out', 'a.txt'), 'utf8'), 'a');
  const events = eventsOf(harness, missionRunId);
  assert.ok(indexOfEvent(events, 'a', 'artifacts_collected') < indexOfEvent(events, 'b', 'artifacts_materialized'));
});

test('a worktree dependant starts from the committed result of its worktree dependency; the source branch stays untouched', async () => {
  const harness = makeHarness();
  const repo = join(harness.root, 'repo');
  mkdirSync(repo);
  const git = (args, options = {}) => execFileSync('git', ['-c', 'user.email=t@cherry.local', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'], ...options }).toString().trim();
  writeFileSync(join(repo, 'README.md'), 'fixture' + String.fromCharCode(10));
  git(['init', '-q']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  const plan = makePlan([
    planNode('a', { sandbox: 'git-worktree' }),
    planNode('b', { deps: ['a'], sandbox: 'git-worktree', checks: [{ id: 'b-sees-a', kind: 'file', required: true, path: 'out/a.txt', description: 'the dependency result is in the worktree' }] }),
  ]);
  const envelopes = Object.fromEntries(plan.nodes.map((node) => [node.id, envelopeFor(plan, node, { mock: writes(node.id), sourceRoot: repo })]));
  const registered = harness.executor.register({ plan, envelopes });
  assert.equal(registered.ok, true, JSON.stringify(registered));
  harness.executor.start(registered.missionRunId);
  const mission = await settle(harness, registered.missionRunId);
  assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
  assert.ok(mission.nodes.a.sandbox.headCommit, 'a committed its result on its sandbox branch');
  assert.notEqual(mission.nodes.a.sandbox.headCommit, base);
  assert.equal(mission.nodes.b.sandbox.baseCommit, mission.nodes.a.sandbox.headCommit);
  assert.equal(mission.nodes.b.sandbox.basedOn, 'a');
  assert.notEqual(mission.nodes.b.sandbox.branchName, mission.nodes.a.sandbox.branchName);
  assert.equal(git(['rev-parse', 'HEAD']), base, 'the source branch is untouched');
  const events = eventsOf(harness, registered.missionRunId);
  assert.ok(indexOfEvent(events, 'a', 'sandbox_committed') >= 0);
});

test('registration refuses stale hashes, foreign workspaces and bad envelopes, and is idempotent otherwise', async () => {
  const harness = makeHarness();
  const plan = makePlan([planNode('a')]);
  const envelopes = harness.envelopes(plan);

  const stale = harness.executor.register({ plan: { ...plan, contentHash: 'a'.repeat(64) }, envelopes });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'hash_mismatch');

  const foreign = harness.executor.register({ plan, envelopes: { a: envelopeFor(plan, plan.nodes[0], { sourceRoot: harness.source, workspaceId: 'ws-other' }) } });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'workspace_mismatch');

  const tampered = { ...envelopes.a, boundedPrompt: '{"nodeId":"a"}' };
  assert.equal(harness.executor.register({ plan, envelopes: { a: tampered } }).code, 'invalid_envelope');
  assert.equal(harness.executor.register({ plan, envelopes: {} }).code, 'missing_envelope');
  assert.equal(harness.executor.register({ plan, envelopes: { a: envelopeFor(plan, plan.nodes[0], { sourceRoot: harness.source, adapter: 'rm-rf' }) } }).code, 'unknown_adapter');
  const invalid = harness.executor.register({ plan: { ...plan, nodes: [] }, envelopes: {} });
  assert.equal(invalid.code, 'invalid_plan');
  assert.deepEqual(invalid.problems.map((problem) => problem.code), ['no_nodes']);

  const first = harness.executor.register({ plan, envelopes });
  assert.equal(first.ok, true);
  const again = harness.executor.register({ plan, envelopes });
  assert.deepEqual(again, { ok: true, missionRunId: first.missionRunId, existing: true });
  const fixtureStyle = harness.executor.register({ plan: { ...plan, contentHash: '' }, envelopes });
  assert.equal(fixtureStyle.missionRunId, first.missionRunId, 'an empty contentHash is computed and matches');

  const changed = makePlan([planNode('a')], { outcome: 'A different outcome' });
  const conflict = harness.executor.register({ plan: changed, envelopes: harness.envelopes(changed) });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'conflict');
  assert.equal(harness.executor.get(first.missionRunId).contentHash, plan.contentHash);
  assert.equal(harness.executor.list().length, 1);
  assert.equal(harness.executor.start('mr-missing').code, 'not_found');
  assert.equal(harness.executor.decide('mr-missing', { nodeId: 'a', decision: 'approve', approvalId: 'x', contentHash: plan.contentHash }).code, 'not_found');
});

// ---------------- HTTP wiring (own server instance on its own port) ----------------

describe('mission HTTP wiring', () => {
  const BASE = 'http://127.0.0.1:47831';
  const token = 'mission-pair-token-0123456789';
  let child;
  let workDir;
  let source;

  const api = (path, options = {}) =>
    fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-cherry-pair': token, ...(options.headers ?? {}) },
    });

  async function portIsFree() {
    try {
      await fetch(`${BASE}/status`);
      return false;
    } catch {
      return true;
    }
  }

  before(async () => {
    for (let attempt = 0; attempt < 100 && !(await portIsFree()); attempt += 1) await sleep(50);
    workDir = mkdtempSync(join(tmpdir(), 'cherry-mission-e2e-'));
    source = join(workDir, 'src');
    mkdirSync(source);
    child = spawn(
      process.execPath,
      [join(here, 'server.mjs'), '--root', workDir, '--state', join(workDir, '.state'), '--port', '47831', '--allow-mock-host', '--mock-fail-first', 'flaky'],
      { env: { ...process.env, CHERRY_RUNNER_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`mission runner exited early with code ${child.exitCode}`);
      try {
        if ((await fetch(`${BASE}/status`)).ok) return;
      } catch {
        /* not up yet */
      }
      await sleep(100);
    }
    throw new Error('mission runner did not start');
  });

  after(() => {
    child?.kill('SIGKILL');
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* windows file locks */
    }
  });

  async function pollMission(missionRunId, predicate, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { mission } = await (await api(`/v2/missions/${missionRunId}`)).json();
      if (predicate(mission)) return mission;
      if (Date.now() > deadline) throw new Error(`mission ${missionRunId} stuck at ${mission.status}`);
      await sleep(100);
    }
  }

  test('status keeps its legacy shape and lists the mission adapters separately', async () => {
    const body = await (await api('/status')).json();
    assert.equal(body.paired, true);
    assert.deepEqual(
      body.v2.adapters.sort(),
      ['cherry-export', 'cherry-verify', 'claude-cli', 'codex-cli', 'safe-command', 'scrapling-fetch', 'youtube-rss-watch'].sort(),
    );
    assert.deepEqual(body.v2.missionAdapters, ['agent-host', 'cherry-check', 'mock-host']);
    assert.equal(body.v2.allowMockHost, true);
    assert.deepEqual(body.v2.mockFailFirst, ['flaky']);
    assert.equal((await fetch(`${BASE}/v2/hosts`)).status, 401);
    assert.equal((await fetch(`${BASE}/v2/missions`)).status, 401);
  });

  test('GET /v2/hosts returns probe records and a probe timestamp', async () => {
    const response = await api('/v2/hosts');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.probedAt, /^\d{4}-/);
    const mock = body.hosts.find((host) => host.hostId === 'mock');
    assert.equal(mock.available, true);
    assert.equal(mock.status, 'shipped_tested');
    assert.equal(body.hosts.find((host) => host.hostId === 'manual').boundary, 'unknown');
    assert.ok(body.hosts.some((host) => host.hostId === 'codex'));
    const cached = await (await api('/v2/hosts')).json();
    assert.equal(cached.probedAt, body.probedAt, 'probes are cached');
  });

  test('missions register, start, run to a verified success, and list', async () => {
    const plan = makePlan([planNode('a'), planNode('b', { deps: ['a'] })], { id: 'plan-http', missionId: 'ms-http' });
    const envelopes = Object.fromEntries(plan.nodes.map((node) => [node.id, envelopeFor(plan, node, { mock: writes(node.id), sourceRoot: source })]));
    const created = await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan, envelopes }) });
    assert.equal(created.status, 201);
    const { missionRunId } = await created.json();
    const replay = await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan, envelopes }) });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).missionRunId, missionRunId);
    const changed = makePlan([planNode('a'), planNode('b', { deps: ['a'] })], { id: 'plan-http', missionId: 'ms-http', outcome: 'Changed' });
    const conflict = await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan: changed, envelopes }) });
    assert.equal(conflict.status, 409);
    const invalid = await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan: { ...plan, contentHash: 'b'.repeat(64) }, envelopes }) });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /hash/);

    const started = await api(`/v2/missions/${missionRunId}/start`, { method: 'POST', body: '{}' });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).mission.status, 'running');
    const mission = await pollMission(missionRunId, (candidate) => TERMINAL.has(candidate.status));
    assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
    assert.equal(mission.nodes.b.evaluation.status, 'passed');
    assert.deepEqual(mission.nodes.a.host, { hostId: 'mock', kind: 'mock', version: 'mock' });
    assert.match(mission.nodes.a.startedAt, /^\d{4}-/);
    assert.match(mission.nodes.a.finishedAt, /^\d{4}-/);
    assert.deepEqual(Object.keys(mission.nodes.a.evaluation.checks[0]).sort(), ['detail', 'evidenceRefs', 'id', 'name', 'status']);

    const list = await (await api('/v2/missions')).json();
    assert.ok(list.missions.some((summary) => summary.id === missionRunId && summary.status === 'succeeded'));
    assert.equal((await api('/v2/missions/mr-missing')).status, 404);
    assert.equal((await api(`/v2/missions/${missionRunId}/start`, { method: 'POST', body: '{}' })).status, 409, 'a finished mission cannot start again');
  });

  test('mock-fail-first makes the first attempt fail its checks and the executor repairs once', async () => {
    const plan = makePlan([planNode('flaky', { hostKinds: ['local-runner'], maxAttempts: 2 })], { id: 'plan-http-flaky', missionId: 'ms-http-flaky' });
    const envelopes = { flaky: envelopeFor(plan, plan.nodes[0], { adapter: 'agent-host', sourceRoot: source }) };
    const { missionRunId } = await (await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan, envelopes }) })).json();
    await api(`/v2/missions/${missionRunId}/start`, { method: 'POST', body: '{}' });
    const mission = await pollMission(missionRunId, (candidate) => TERMINAL.has(candidate.status));
    assert.equal(mission.status, 'succeeded', JSON.stringify(nodeStatuses(mission)));
    assert.equal(mission.nodes.flaky.attempts, 2);
    assert.equal(mission.nodes.flaky.jobIds.length, 2);
    assert.equal(mission.nodes.flaky.evaluation.status, 'passed');
    assert.equal(readFileSync(join(mission.nodes.flaky.sandbox.root, 'out', 'flaky.txt'), 'utf8'), 'written by the mock host for flaky attempt 2\n');
  });

  test('decisions and cancellation work over HTTP', async () => {
    const plan = makePlan([planNode('h', { kind: 'human_decision' }), planNode('b', { deps: ['h'] })], { id: 'plan-http-decide', missionId: 'ms-http-decide' });
    const envelopes = { b: envelopeFor(plan, plan.nodes[1], { mock: writes('b'), sourceRoot: source }) };
    const { missionRunId } = await (await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan, envelopes }) })).json();
    await api(`/v2/missions/${missionRunId}/start`, { method: 'POST', body: '{}' });
    const waiting = await pollMission(missionRunId, (candidate) => candidate.status === 'waiting_for_human');
    assert.equal(waiting.nodes.h.status, 'waiting_for_human');
    const badHash = await api(`/v2/missions/${missionRunId}/decisions`, { method: 'POST', body: JSON.stringify({ nodeId: 'h', decision: 'approve', approvalId: 'ap-1', contentHash: 'c'.repeat(64) }) });
    assert.equal(badHash.status, 409);
    const emptyApproval = await api(`/v2/missions/${missionRunId}/decisions`, { method: 'POST', body: JSON.stringify({ nodeId: 'h', decision: 'approved', approvalId: '', contentHash: plan.contentHash }) });
    assert.equal(emptyApproval.status, 400);
    const decided = await api(`/v2/missions/${missionRunId}/decisions`, { method: 'POST', body: JSON.stringify({ nodeId: 'h', decision: 'approved', approvalId: 'ap-1', contentHash: plan.contentHash }) });
    assert.equal(decided.status, 200);
    const done = await pollMission(missionRunId, (candidate) => TERMINAL.has(candidate.status));
    assert.equal(done.status, 'succeeded', JSON.stringify(nodeStatuses(done)));

    const slowPlan = makePlan([planNode('a')], { id: 'plan-http-cancel', missionId: 'ms-http-cancel' });
    const slowEnvelopes = { a: envelopeFor(slowPlan, slowPlan.nodes[0], { mock: writes('a', { sleepMs: 8000 }), sourceRoot: source }) };
    const slow = await (await api('/v2/missions', { method: 'POST', body: JSON.stringify({ plan: slowPlan, envelopes: slowEnvelopes }) })).json();
    await api(`/v2/missions/${slow.missionRunId}/start`, { method: 'POST', body: '{}' });
    await pollMission(slow.missionRunId, (candidate) => candidate.nodes.a.status === 'running');
    const cancelled = await api(`/v2/missions/${slow.missionRunId}/cancel`, { method: 'POST', body: '{}' });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).mission.status, 'cancelled');
    const after = await pollMission(slow.missionRunId, (candidate) => candidate.nodes.a.status === 'cancelled', 5000);
    assert.equal(after.status, 'cancelled');
  });
});
