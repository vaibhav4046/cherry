/**
 * MissionExecutor: advances a validated mission plan over the existing
 * DurableQueue, EventsLog, SandboxManager and adapter registry.
 *
 * One queue job per attempt. The job executor (execute) always resolves
 * 'completed' for the queue: the queue records that the attempt ran, and the
 * node outcome comes from the evaluation the executor runs afterwards. A node
 * reaches 'succeeded' only through a passed evaluation report; provider
 * completion moves it to 'verifying'. A failed report is repaired at most
 * repairBudget times within the node's maxAttempts, with the failed checks
 * appended to the task text as data. Dependents of failed or cancelled nodes
 * are blocked. Every transition appends to the events log under
 * `${missionRunId}:${nodeId}` so parallel overlap is provable from the log.
 * Missions persist to <dataDir>/missions.json.
 */
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { loadJson, saveJsonAtomic } from './store.mjs';
import { computeActionHash } from './canonical.mjs';
import { validateEnvelope } from './queue.mjs';
import { redact } from './redact.mjs';
import { parseCheckSpec, runChecks } from './checks.mjs';
import { buildTaskText, hostKindOf } from './agent-hosts.mjs';
import {
  PLAN_LIMITS,
  computeBlockedNodeIds,
  computePlanContentHash,
  computeReadyNodeIds,
  derivePlanStatus,
  validateMissionPlan,
} from './mission-plan.mjs';

const ACTIVE_MISSION_STATUSES = new Set(['running', 'verifying', 'waiting_for_human']);
const TERMINAL_MISSION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const IN_FLIGHT_NODE_STATUSES = new Set(['ready', 'running', 'verifying']);
const SANDBOX_PROVIDERS = new Set(['directory', 'git-worktree']);
const SCRATCH_DIR_NAME = '.cherry-scratch';
const safeSegment = (value) => String(value ?? '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'mission';
/** Accepted decision spellings, normalised to the browser vocabulary. */
const DECISIONS = { approve: 'approved', approved: 'approved', reject: 'rejected', rejected: 'rejected' };
const FINISHED_NODE_STATUSES = new Set(['succeeded', 'failed', 'blocked', 'cancelled']);
const DEFAULT_REPAIR_BUDGET = 1;
const OUTPUT_TAIL_CHARS = 2000;

const NODE_EVENT_TYPES = {
  ready: 'node_ready',
  running: 'node_started',
  verifying: 'node_verifying',
  succeeded: 'node_succeeded',
  failed: 'node_failed',
  blocked: 'node_blocked',
  cancelled: 'node_cancelled',
  waiting_for_human: 'node_waiting_for_human',
};

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra });
const nonEmpty = (value) => typeof value === 'string' && value.length > 0;

function parsePayload(text) {
  try {
    const payload = JSON.parse(text);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * The files a node's own verification plan expects, with the text a
 * file_contains check looks for. Hosts receive them as plain data; only the
 * test-only mock host acts on them, real hosts read the bounded prompt.
 */
function fileTargetsFor(planNode) {
  const targets = [];
  for (const spec of Array.isArray(planNode?.verificationPlan) ? planNode.verificationPlan : []) {
    const parsed = parseCheckSpec(spec);
    if (!parsed || typeof parsed.path !== 'string' || parsed.path.length === 0) continue;
    if (parsed.kind !== 'file' && parsed.kind !== 'file_contains') continue;
    targets.push({ path: parsed.path, contains: typeof parsed.contains === 'string' ? parsed.contains : null });
  }
  return targets;
}

/** Resolve `relative` inside `root`; null when it would escape the root. */
function insideRoot(root, relative) {
  if (typeof root !== 'string' || typeof relative !== 'string' || relative.length === 0) return null;
  const base = resolve(root);
  const target = resolve(join(base, relative));
  return target === base || target.startsWith(base + sep) ? target : null;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The evaluation record of a human_decision node: its human check decided by a person, nothing executed. */
function humanEvaluation(planNode, decision) {
  const approved = decision?.decision === 'approved';
  const checks = [];
  for (const spec of Array.isArray(planNode?.verificationPlan) ? planNode.verificationPlan : []) {
    const parsed = parseCheckSpec(spec);
    if (!parsed || typeof parsed.id !== 'string') continue;
    if (parsed.kind === 'human') {
      checks.push({
        id: parsed.id,
        name: typeof parsed.description === 'string' ? parsed.description : 'A person decides',
        status: approved ? 'passed' : 'failed',
        evidenceRefs: [],
        detail: approved ? `approved by a person (approval ${decision.approvalId ?? 'unknown'})` : 'rejected by a person',
      });
    } else {
      checks.push({ id: parsed.id, name: typeof parsed.description === 'string' ? parsed.description : parsed.id, status: 'not_run', evidenceRefs: [], detail: 'not run: this node is decided by a person' });
    }
  }
  return { status: approved ? 'passed' : 'failed', checks, requiredIds: checks.filter((check) => check.status !== 'not_run').map((check) => check.id), error: null };
}

function newNode(planNode, at) {
  return {
    id: planNode.id,
    kind: planNode.kind,
    status: 'pending',
    attempts: 0,
    repairs: 0,
    artifacts: [],
    inputs: [],
    jobIds: [],
    currentJobId: null,
    sandboxLeaseId: null,
    sandbox: null,
    host: null,
    hostResult: null,
    evaluation: null,
    failedChecks: [],
    decision: null,
    lastError: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: at,
  };
}

/** The host record the browser reads: { hostId, kind, version } or null. */
function hostRecord(summary, previous) {
  if (!summary?.hostId) return previous ?? null;
  return { hostId: summary.hostId, kind: hostKindOf(summary.hostId), version: summary.providerVersion ?? null };
}

/** Keep queue results compact: the full streams live in the sandbox artifacts. */
function summariseHostResult(result) {
  const tail = (text) => (typeof text === 'string' && text.length > OUTPUT_TAIL_CHARS ? text.slice(-OUTPUT_TAIL_CHARS) : text ?? '');
  return {
    status: result?.status ?? 'failed',
    hostId: result?.hostId ?? null,
    exitCode: result?.exitCode ?? null,
    reason: result?.reason ?? null,
    providerVersion: result?.providerVersion ?? null,
    wallClockMs: result?.wallClockMs ?? null,
    stdoutArtifact: result?.stdoutArtifact ?? null,
    stderrArtifact: result?.stderrArtifact ?? null,
    stdoutTail: redact(tail(result?.stdout)),
    stderrTail: redact(tail(result?.stderr)),
    timedOut: Boolean(result?.timedOut),
    aborted: Boolean(result?.aborted),
    report: result?.report ?? null,
    note: 'Provider completion is not verification.',
  };
}

export class MissionExecutor {
  constructor({ dataDir, queue, events = null, sandboxes, hosts = null, adapters, now = () => Date.now(), repairBudget = DEFAULT_REPAIR_BUDGET, allowedExecutables = new Set(), jobRunner = null }) {
    if (!dataDir) throw new Error('MissionExecutor requires a dataDir');
    if (!queue || !sandboxes || !adapters) throw new Error('MissionExecutor requires queue, sandboxes and adapters');
    this.file = join(dataDir, 'missions.json');
    this.queue = queue;
    this.events = events;
    this.sandboxes = sandboxes;
    this.dataDir = dataDir;
    this.hosts = hosts;
    this.adapters = adapters;
    this.now = now;
    this.repairBudget = Number.isInteger(repairBudget) && repairBudget >= 0 ? repairBudget : DEFAULT_REPAIR_BUDGET;
    this.allowedExecutables = allowedExecutables;
    this.jobRunner = jobRunner ?? ((envelope, context) => this.execute(envelope, context));
    this.missions = loadJson(this.file, []);
    if (!Array.isArray(this.missions)) this.missions = [];
    this.ticking = null;
    this.evaluations = new Map();
    this.recoverAfterRestart();
  }

  iso() {
    return new Date(this.now()).toISOString();
  }

  save() {
    saveJsonAtomic(this.file, this.missions);
  }

  emit(mission, nodeId, type) {
    this.events?.append(nodeId ? `${mission.id}:${nodeId}` : mission.id, type, this.iso());
  }

  get(missionRunId) {
    return this.missions.find((mission) => mission.id === missionRunId) ?? null;
  }

  list() {
    return this.missions.map((mission) => ({
      id: mission.id,
      workspaceId: mission.workspaceId,
      planId: mission.planId,
      missionId: mission.missionId,
      revision: mission.revision,
      contentHash: mission.contentHash,
      outcome: mission.plan.outcome,
      status: mission.status,
      nodes: this.statuses(mission),
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      startedAt: mission.startedAt,
      finishedAt: mission.finishedAt,
    }));
  }

  statuses(mission) {
    return Object.fromEntries(Object.entries(mission.nodes).map(([id, node]) => [id, node.status]));
  }

  planNodeOf(mission, nodeId) {
    return mission.plan.nodes.find((node) => node.id === nodeId);
  }

  transition(mission, node, status) {
    node.status = status;
    node.updatedAt = this.iso();
    mission.updatedAt = node.updatedAt;
    if (status === 'running' && !node.startedAt) node.startedAt = node.updatedAt;
    if (FINISHED_NODE_STATUSES.has(status)) node.finishedAt = node.updatedAt;
    const type = NODE_EVENT_TYPES[status];
    if (type) this.emit(mission, node.id, type);
  }

  /** True when the envelope was materialised by this executor for a known mission. */
  owns(envelope) {
    return typeof envelope?.missionRunId === 'string' && this.get(envelope.missionRunId) !== null;
  }

  // ---------------- registration and control ----------------

  register({ plan, envelopes, hostPreferences = null } = {}) {
    if (!plan || typeof plan !== 'object') return refuse('invalid_plan', 'plan must be an object', { problems: [] });
    const problems = validateMissionPlan(plan);
    if (problems.length > 0) return refuse('invalid_plan', problems.map((problem) => problem.message).join('; '), { problems });
    const contentHash = computePlanContentHash(plan);
    if (nonEmpty(plan.contentHash) && plan.contentHash !== contentHash) {
      return refuse('hash_mismatch', 'the plan contentHash does not match the recomputed hash; revise the plan and register it again');
    }
    const existing = this.missions.find((mission) => mission.planId === plan.id && mission.revision === plan.revision);
    if (existing) {
      if (existing.contentHash === contentHash) return { ok: true, missionRunId: existing.id, existing: true };
      return refuse('conflict', `plan ${plan.id} revision ${plan.revision} is already registered with a different contentHash`);
    }
    if (!envelopes || typeof envelopes !== 'object' || Array.isArray(envelopes)) return refuse('missing_envelope', 'envelopes must be a record keyed by node id');
    const stored = {};
    for (const node of plan.nodes) {
      if (node.kind === 'human_decision') continue;
      const envelope = envelopes[node.id];
      if (!envelope) return refuse('missing_envelope', `node ${node.id} has no execution envelope`);
      const envelopeProblems = validateEnvelope(envelope);
      if (envelopeProblems.length > 0) return refuse('invalid_envelope', `node ${node.id}: ${envelopeProblems.join('; ')}`);
      if (envelope.workspaceId !== plan.workspaceId) {
        return refuse('workspace_mismatch', `node ${node.id}: the envelope belongs to workspace ${envelope.workspaceId}, not ${plan.workspaceId}`);
      }
      if (!this.adapters.has(envelope.adapter)) return refuse('unknown_adapter', `node ${node.id}: unknown adapter ${envelope.adapter}`);
      const payload = parsePayload(envelope.boundedPrompt);
      if (!payload || payload.nodeId !== node.id) return refuse('invalid_envelope', `node ${node.id}: boundedPrompt must be a JSON object naming the node`);
      stored[node.id] = envelope;
    }
    for (const nodeId of Object.keys(envelopes)) {
      if (!plan.nodes.some((node) => node.id === nodeId)) return refuse('unknown_node', `envelope for unknown node ${nodeId}`);
    }
    const at = this.iso();
    const mission = {
      id: `mr-${randomBytes(8).toString('hex')}`,
      workspaceId: plan.workspaceId,
      planId: plan.id,
      missionId: plan.missionId,
      revision: plan.revision,
      contentHash,
      status: 'ready',
      plan: { ...plan, contentHash },
      envelopes: stored,
      hostPreferences,
      nodes: Object.fromEntries(plan.nodes.map((node) => [node.id, newNode(node, at)])),
      createdAt: at,
      updatedAt: at,
      startedAt: null,
      finishedAt: null,
      lastError: null,
    };
    this.missions.push(mission);
    this.save();
    return { ok: true, missionRunId: mission.id, existing: false };
  }

  start(missionRunId) {
    const mission = this.get(missionRunId);
    if (!mission) return refuse('not_found', `no mission run ${missionRunId}`);
    if (TERMINAL_MISSION_STATUSES.has(mission.status)) return refuse('not_startable', `mission run ${missionRunId} is ${mission.status}`);
    if (mission.status === 'ready') {
      mission.status = 'running';
      mission.startedAt = this.iso();
      mission.updatedAt = mission.startedAt;
      this.emit(mission, null, 'mission_started');
      this.save();
    }
    void this.tick();
    return { ok: true, mission };
  }

  cancel(missionRunId) {
    const mission = this.get(missionRunId);
    if (!mission) return refuse('not_found', `no mission run ${missionRunId}`);
    if (TERMINAL_MISSION_STATUSES.has(mission.status)) return { ok: true, mission };
    for (const node of Object.values(mission.nodes)) {
      if (['succeeded', 'failed', 'blocked', 'cancelled'].includes(node.status)) continue;
      const wasRunning = node.status === 'running';
      if ((node.status === 'ready' || wasRunning) && node.currentJobId) this.queue.cancel(node.currentJobId);
      this.evaluations.get(`${mission.id}:${node.id}`)?.abort(new Error('cancelled'));
      this.transition(mission, node, 'cancelled');
      // A running worker releases its sandbox when execute() observes the cancellation.
      if (!wasRunning) void this.releaseSandbox(mission, node, 'cancelled');
    }
    mission.status = 'cancelled';
    mission.finishedAt = this.iso();
    mission.updatedAt = mission.finishedAt;
    this.emit(mission, null, 'mission_status');
    this.save();
    return { ok: true, mission };
  }

  /** Record a person's decision; the runner never judges it. */
  decide(missionRunId, { nodeId, decision, approvalId = null, contentHash } = {}) {
    const mission = this.get(missionRunId);
    if (!mission) return refuse('not_found', `no mission run ${missionRunId}`);
    const node = mission.nodes[nodeId];
    if (!node) return refuse('unknown_node', `mission run ${missionRunId} has no node ${nodeId}`);
    if (node.status !== 'waiting_for_human') return refuse('not_waiting', `node ${nodeId} is ${node.status}, not waiting for a person`);
    if (contentHash !== mission.contentHash) return refuse('hash_mismatch', 'the decision names a different plan contentHash; the plan changed since the person looked at it');
    const normalised = typeof decision === 'string' ? DECISIONS[decision] : undefined;
    if (!normalised) return refuse('bad_decision', 'decision must be approved or rejected');
    if (normalised === 'approved' && !nonEmpty(approvalId)) return refuse('approval_required', 'an approval id is required to approve');
    node.decision = { decision: normalised, approvalId: nonEmpty(approvalId) ? approvalId : null, contentHash, at: this.iso() };
    // A person's decision is this node's evaluation: the human check passes or fails by that decision,
    // so the browser mirror gets a real report and never marks a decided node succeeded without one.
    node.evaluation = humanEvaluation(this.planNodeOf(mission, nodeId), node.decision);
    if (normalised === 'approved') {
      this.transition(mission, node, 'succeeded');
      void this.releaseSandbox(mission, node, 'succeeded');
    } else {
      node.lastError = 'rejected by a person';
      this.transition(mission, node, 'failed');
      void this.releaseSandbox(mission, node, 'failed');
    }
    if (mission.status === 'waiting_for_human') mission.status = 'running';
    this.blockDependents(mission);
    this.refreshStatus(mission);
    void this.tick();
    return { ok: true, mission };
  }

  // ---------------- progression ----------------

  /** Idempotent; safe from a timer. Overlapping calls share one pass. */
  tick() {
    if (this.ticking) return this.ticking;
    this.ticking = this.tickNow().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  async tickNow() {
    for (const mission of [...this.missions]) {
      if (!ACTIVE_MISSION_STATUSES.has(mission.status)) continue;
      try {
        await this.reconcile(mission);
        this.blockDependents(mission);
        await this.scheduleReady(mission);
      } catch (error) {
        // A progression fault is recorded on the mission instead of crashing the runner timer.
        mission.lastError = redact(String(error?.message ?? error));
      }
      this.refreshStatus(mission);
    }
    this.queue.runPending(this.jobRunner);
  }

  /** Nodes whose job finished move to verifying and get evaluated. */
  async reconcile(mission) {
    for (const node of Object.values(mission.nodes)) {
      const key = `${mission.id}:${node.id}`;
      if (node.status === 'verifying') {
        if (!this.evaluations.has(key)) await this.evaluate(mission, node);
        continue;
      }
      if (node.status !== 'ready' && node.status !== 'running') continue;
      const job = node.currentJobId ? this.queue.getJob(node.currentJobId) : null;
      if (!job) {
        await this.failNode(mission, node, 'the job record disappeared');
        continue;
      }
      if (job.status === 'cancelled') {
        this.transition(mission, node, 'cancelled');
        await this.releaseSandbox(mission, node, 'cancelled');
        continue;
      }
      if (job.status !== 'completed' && job.status !== 'failed') continue;
      node.hostResult = job.result?.hostResult ?? summariseHostResult({ status: 'failed', reason: job.lastError ?? 'the job failed before the host ran' });
      node.host = hostRecord(node.hostResult, node.host);
      if (node.hostResult.status === 'needs_human') {
        this.transition(mission, node, 'waiting_for_human');
        this.save();
        continue;
      }
      this.transition(mission, node, 'verifying');
      this.save();
      await this.evaluate(mission, node);
    }
  }

  async evaluate(mission, node) {
    const key = `${mission.id}:${node.id}`;
    const planNode = this.planNodeOf(mission, node.id);
    const controller = new AbortController();
    this.evaluations.set(key, controller);
    let report;
    try {
      const root = node.sandbox?.root ?? this.workingDirectoryFor(mission, node);
      report = await runChecks(planNode.verificationPlan, root, {
        allowedExecutables: this.allowedExecutables,
        timeoutMs: planNode.timeoutMs,
        signal: controller.signal,
        now: this.now,
      });
    } catch (error) {
      report = { status: 'failed', checks: [], requiredIds: [], error: redact(String(error?.message ?? error)) };
    } finally {
      this.evaluations.delete(key);
    }
    if (node.status !== 'verifying') return;
    node.evaluation = report;
    if (report.status === 'passed') {
      node.failedChecks = [];
      if (node.sandbox?.provider === 'git-worktree' && node.sandboxLeaseId) {
        const committed = await this.sandboxes.commitAll(node.sandboxLeaseId, `cherry: ${node.id} attempt ${node.attempts}`);
        if (committed.ok) {
          node.sandbox.headCommit = committed.commit;
          if (committed.committed) this.emit(mission, node.id, 'sandbox_committed');
        }
      }
      this.collectArtifacts(mission, node, planNode);
      this.transition(mission, node, 'succeeded');
      await this.releaseSandbox(mission, node, 'succeeded');
    } else if (report.status === 'blocked') {
      this.transition(mission, node, 'waiting_for_human');
    } else {
      const failedChecks = report.checks.filter((check) => check.status !== 'passed').map((check) => ({ id: check.id, status: check.status, detail: check.detail }));
      if (node.attempts < planNode.maxAttempts && node.repairs < this.repairBudget) {
        node.repairs += 1;
        node.failedChecks = failedChecks;
        node.status = 'pending';
        node.updatedAt = this.iso();
        this.emit(mission, node.id, 'node_repair_scheduled');
      } else {
        const ids = failedChecks.map((check) => check.id).join(', ') || report.error || 'no checks ran';
        await this.failNode(mission, node, `verification failed: ${ids}`);
      }
    }
    this.save();
  }

  blockDependents(mission) {
    for (const nodeId of computeBlockedNodeIds(mission.plan, this.statuses(mission))) {
      const node = mission.nodes[nodeId];
      node.lastError = 'a dependency failed or was cancelled';
      this.transition(mission, node, 'blocked');
    }
  }

  async scheduleReady(mission) {
    const ready = computeReadyNodeIds(mission.plan, this.statuses(mission));
    let inFlight = Object.values(mission.nodes).filter((node) => IN_FLIGHT_NODE_STATUSES.has(node.status)).length;
    for (const nodeId of ready) {
      const node = mission.nodes[nodeId];
      const planNode = this.planNodeOf(mission, nodeId);
      if (planNode.kind === 'human_decision') {
        this.transition(mission, node, 'waiting_for_human');
        continue;
      }
      if (inFlight >= PLAN_LIMITS.maxParallel) break;
      await this.enqueueAttempt(mission, node, planNode);
      if (node.status === 'ready') inFlight += 1;
    }
    this.save();
  }

  /** Empty per-mission source for directory sandboxes that name no repository; lives inside the approved root. */
  scratchRootFor(mission) {
    const root = join(this.sandboxes.allowedRoots[0], SCRATCH_DIR_NAME, safeSegment(mission.id));
    mkdirSync(root, { recursive: true });
    return root;
  }

  artifactsDirFor(mission) {
    return join(this.dataDir, 'artifacts', safeSegment(mission.id));
  }

  /** Copy a succeeded node's declared outputs into the mission artifact store so dependants can read them. */
  collectArtifacts(mission, node, planNode) {
    const root = node.sandbox?.root ?? this.workingDirectoryFor(mission, node);
    if (!root) return [];
    const payload = parsePayload(mission.envelopes[node.id]?.boundedPrompt ?? '') ?? {};
    const declared = [...new Set([...(Array.isArray(payload.outputs) ? payload.outputs.map(String) : []), ...fileTargetsFor(planNode).map((target) => target.path)])];
    const artifacts = [];
    for (const relative of declared) {
      const source = insideRoot(root, relative);
      if (!source || !existsSync(source) || !statSync(source).isFile()) continue;
      const destination = join(this.artifactsDirFor(mission), safeSegment(node.id), relative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
      artifacts.push({ path: relative, bytes: statSync(source).size, sha256: sha256File(source) });
    }
    node.artifacts = artifacts;
    if (artifacts.length > 0) this.emit(mission, node.id, 'artifacts_collected');
    return artifacts;
  }

  /** Place every direct dependency's artifacts into a fresh sandbox at the same relative paths. */
  materializeDependencies(mission, node, planNode) {
    const inputs = [];
    for (const dependencyId of Array.isArray(planNode?.dependencyIds) ? planNode.dependencyIds : []) {
      const dependency = mission.nodes[dependencyId];
      for (const artifact of Array.isArray(dependency?.artifacts) ? dependency.artifacts : []) {
        const source = join(this.artifactsDirFor(mission), safeSegment(dependencyId), artifact.path);
        const destination = insideRoot(node.sandbox?.root, artifact.path);
        if (!destination || !existsSync(source) || existsSync(destination)) continue;
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
        inputs.push({ from: dependencyId, path: artifact.path, sha256: artifact.sha256 });
      }
    }
    node.inputs = inputs;
    if (inputs.length > 0) this.emit(mission, node.id, 'artifacts_materialized');
  }

  /** The committed head of the last worktree dependency, so a dependant worktree starts from its result. */
  inheritedBaseFor(mission, planNode) {
    let inherited = null;
    for (const dependencyId of Array.isArray(planNode?.dependencyIds) ? planNode.dependencyIds : []) {
      const dependency = mission.nodes[dependencyId];
      if (dependency?.sandbox?.provider === 'git-worktree' && nonEmpty(dependency.sandbox.headCommit)) inherited = { nodeId: dependencyId, commit: dependency.sandbox.headCommit };
    }
    return inherited;
  }

  workingDirectoryFor(mission, node) {
    const payload = parsePayload(mission.envelopes[node.id]?.boundedPrompt ?? '') ?? {};
    return typeof payload.sandbox?.sourceRoot === 'string' ? payload.sandbox.sourceRoot : null;
  }

  async enqueueAttempt(mission, node, planNode) {
    const template = mission.envelopes[node.id];
    const payload = parsePayload(template.boundedPrompt) ?? {};
    const provider = payload.sandbox?.provider ?? planNode.sandbox;
    let sourceRoot = nonEmpty(payload.sandbox?.sourceRoot) ? payload.sandbox.sourceRoot : null;
    if (SANDBOX_PROVIDERS.has(provider) && !sourceRoot) {
      if (provider !== 'directory') {
        await this.failNode(mission, node, `the node asks for a ${provider} sandbox but its envelope names no sourceRoot`);
        return;
      }
      // Work that names no repository still gets its own empty directory: a scratch root per mission
      // run under the first approved root, so every node writes inside a leased sandbox.
      sourceRoot = this.scratchRootFor(mission);
    }
    if (!node.sandboxLeaseId && SANDBOX_PROVIDERS.has(provider)) {
      // The sandbox path is keyed by the mission run id, so a re-registered or
      // re-run plan never collides with a retained sandbox of an earlier run.
      const inherited = provider === 'git-worktree' && !nonEmpty(payload.sandbox?.baseRef) ? this.inheritedBaseFor(mission, planNode) : null;
      const outcome = await this.sandboxes.allocate({
        missionId: mission.id,
        workItemId: template.workItemId,
        provider,
        sourceRoot,
        baseRef: payload.sandbox?.baseRef ?? inherited?.commit ?? null,
        writable: true,
        retain: true,
      });
      if (!outcome.ok) {
        await this.failNode(mission, node, `sandbox refused (${outcome.code}): ${outcome.reason}`);
        return;
      }
      const { lease } = outcome;
      node.sandboxLeaseId = lease.id;
      node.sandbox = { id: lease.id, root: lease.root, provider: lease.provider, boundary: lease.boundary, branchName: lease.branchName, baseCommit: lease.baseCommit, basedOn: inherited?.nodeId ?? null, headCommit: null, status: lease.status };
      this.emit(mission, node.id, 'sandbox_leased');
      this.materializeDependencies(mission, node, planNode);
    }
    const workingDirectory = node.sandbox?.root ?? this.workingDirectoryFor(mission, node);
    if (!workingDirectory) {
      await this.failNode(mission, node, 'no working directory: the node has neither a sandbox nor a sourceRoot');
      return;
    }
    const attempt = node.attempts + 1;
    const envelope = {
      ...template,
      workingDirectory,
      idempotencyKey: `${template.idempotencyKey}@a${attempt}`,
      createdAt: this.iso(),
      templateActionHash: template.actionHash,
      missionRunId: mission.id,
      missionNodeId: node.id,
      missionAttempt: attempt,
    };
    delete envelope.actionHash;
    envelope.actionHash = computeActionHash(envelope);
    let outcome = this.queue.enqueue(envelope, { timeoutMs: planNode.timeoutMs });
    if (!outcome.ok && outcome.code === 'duplicate') {
      const existing = this.queue.list().find((job) => job.envelope.idempotencyKey === envelope.idempotencyKey);
      if (existing) outcome = { ok: true, jobId: existing.id };
    }
    if (!outcome.ok) {
      await this.failNode(mission, node, `the attempt could not be queued: ${outcome.reason}`);
      return;
    }
    node.attempts = attempt;
    node.jobIds.push(outcome.jobId);
    node.currentJobId = outcome.jobId;
    if (node.sandboxLeaseId) this.sandboxes.setStatus(node.sandboxLeaseId, 'leased');
    this.transition(mission, node, 'ready');
  }

  async failNode(mission, node, reason) {
    node.lastError = redact(reason);
    this.transition(mission, node, 'failed');
    await this.releaseSandbox(mission, node, 'failed');
    this.save();
  }

  async releaseSandbox(mission, node, reason) {
    const lease = node.sandboxLeaseId ? this.sandboxes.get(node.sandboxLeaseId) : null;
    if (!lease) return;
    if (lease.status === 'leased') this.sandboxes.setStatus(lease.id, 'ready');
    if (reason === 'failed' && lease.status === 'ready') this.sandboxes.setStatus(lease.id, 'failed');
    const outcome = await this.sandboxes.release(lease.id, { reason });
    if (outcome.ok && node.sandbox) {
      node.sandbox = { ...node.sandbox, status: outcome.lease.status };
      this.emit(mission, node.id, 'sandbox_released');
      this.save();
    }
  }

  refreshStatus(mission) {
    const derived = derivePlanStatus(mission.plan, this.statuses(mission), mission.status);
    if (derived !== mission.status) {
      mission.status = derived;
      mission.updatedAt = this.iso();
      if (TERMINAL_MISSION_STATUSES.has(derived)) mission.finishedAt = mission.updatedAt;
      this.emit(mission, null, 'mission_status');
    }
    this.save();
  }

  // ---------------- job execution ----------------

  /**
   * Queue executor for mission jobs. Always resolves 'completed' so the
   * queue never retries an attempt on its own; hostResult carries the truth
   * and the evaluation decides the node.
   */
  async execute(envelope, context = {}) {
    const finish = (hostResult) => ({ status: 'completed', hostResult });
    const mission = this.get(envelope?.missionRunId);
    const node = mission?.nodes?.[envelope?.missionNodeId];
    if (!mission || !node) return finish(summariseHostResult({ status: 'failed', reason: 'the job does not belong to a registered mission' }));
    if (node.status === 'cancelled' || mission.status === 'cancelled') {
      return finish(summariseHostResult({ status: 'failed', reason: 'cancelled before the host started', aborted: true }));
    }
    this.transition(mission, node, 'running');
    this.save();
    const payload = parsePayload(envelope.boundedPrompt) ?? {};
    const task = {
      text: buildTaskText(payload, { failedChecks: node.failedChecks }),
      attempt: Number.isInteger(envelope.missionAttempt) ? envelope.missionAttempt : node.attempts,
      contextText: nonEmpty(payload.contextText) ? payload.contextText : null,
      mock: payload.mock ?? null,
      nodeId: node.id,
      outputs: Array.isArray(payload.outputs) ? payload.outputs.map(String) : [],
      fileTargets: fileTargetsFor(this.planNodeOf(mission, node.id)),
    };
    let result;
    try {
      result = await this.adapters.run(envelope, { ...context, task, attempt: task.attempt, sandbox: node.sandbox ? { root: node.sandbox.root } : undefined });
    } catch (error) {
      result = { status: 'failed', reason: redact(String(error?.message ?? error)) };
    }
    const summary = summariseHostResult(result);
    node.hostResult = summary;
    node.host = hostRecord(summary, node.host);
    if (node.status === 'running') {
      this.emit(mission, node.id, 'node_completed');
      if (node.sandboxLeaseId) this.sandboxes.setStatus(node.sandboxLeaseId, 'ready');
    } else if (node.status === 'cancelled') {
      await this.releaseSandbox(mission, node, 'cancelled');
    }
    this.save();
    return finish(summary);
  }

  // ---------------- restart ----------------

  /** Re-derive node state from persisted jobs; the queue re-runs live attempts. */
  recoverAfterRestart() {
    let changed = false;
    for (const mission of this.missions) {
      if (!ACTIVE_MISSION_STATUSES.has(mission.status)) continue;
      for (const node of Object.values(mission.nodes)) {
        if (node.status !== 'ready' && node.status !== 'running') continue;
        if (node.currentJobId && this.queue.getJob(node.currentJobId)) continue;
        node.status = 'failed';
        node.lastError = 'the job record disappeared while the runner was stopped';
        node.updatedAt = this.iso();
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
