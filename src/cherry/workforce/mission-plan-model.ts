/**
 * Mission plan model: the validated outcome-to-work graph. Pure types and pure
 * functions only (validation, hashing, ordering, status derivation, proposal
 * sanitisation). Persistence lives in mission-plan-service. The runner mirrors
 * these rules in runner/lib/mission-plan.mjs and both validators must agree on
 * every fixture under tests/fixtures/mission-plans.
 *
 * A plan never carries a command line. Executables reach a worker only through
 * the envelope allowlist that the host registry derives from host kinds.
 */

import { sha256Canonical } from '../core/hash.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { fail, ok, type Result } from '../core/result.ts';
import { RUNTIME_CAPABILITIES, type ExecutionHostKind, type RuntimeCapability, type WorkItemStatus } from './workforce-model.ts';

// ---------------- Types ----------------

export const MISSION_PLAN_STATUSES = ['draft', 'validated', 'ready', 'running', 'waiting_for_human', 'verifying', 'succeeded', 'failed', 'cancelled'] as const;
export type MissionPlanStatus = (typeof MISSION_PLAN_STATUSES)[number];

export const PLAN_RISKS = ['low', 'medium', 'high', 'critical'] as const;
export type PlanRisk = (typeof PLAN_RISKS)[number];

export const PLAN_NODE_KINDS = ['agent', 'verify', 'human_decision'] as const;
export type PlanNodeKind = (typeof PLAN_NODE_KINDS)[number];

export const SANDBOX_PROVIDERS = ['none', 'directory', 'git-worktree'] as const;
export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number];

export type SandboxBoundary = 'process' | 'worktree-process' | 'container' | 'cloud-sandbox' | 'unknown';

export const VERIFICATION_CHECK_KINDS = ['command', 'file', 'file_contains', 'hash', 'human'] as const;
export type VerificationCheckKind = (typeof VERIFICATION_CHECK_KINDS)[number];

export interface VerificationCheckSpec {
  id: string;
  kind: VerificationCheckKind;
  required: boolean;
  /** command: argv[0] must be runner-allowlisted (node is always allowed). */
  argv?: string[];
  /** command, default 0. */
  expectExitCode?: number;
  /** file, file_contains, hash: relative to the sandbox root. */
  path?: string;
  contains?: string;
  expectedSha256?: string;
  description: string;
}

export interface MissionPlanNode {
  /** ^[a-z0-9][a-z0-9-]{0,39}$ */
  id: string;
  missionId: string;
  title: string;
  objective: string;
  definitionOfDone: string[];
  dependencyIds: string[];
  kind: PlanNodeKind;
  preferredAgentProfileId: string | null;
  /** [] means any capable host. */
  preferredHostKinds: ExecutionHostKind[];
  requiredCapabilities: RuntimeCapability[];
  riskLevel: PlanRisk;
  verificationPlan: VerificationCheckSpec[];
  contextRefs: string[];
  /** 1..3 */
  maxAttempts: number;
  /** 10_000..1_800_000 */
  timeoutMs: number;
  sandbox: SandboxProvider;
}

export interface MissionPlan {
  id: string;
  workspaceId: string;
  missionId: string;
  templateId: string | null;
  outcome: string;
  constraints: string[];
  nodes: MissionPlanNode[];
  status: MissionPlanStatus;
  revision: number;
  /** sha256Canonical over PLAN_HASH_FIELDS. */
  contentHash: string;
  /** Human approval of exactly contentHash, else null. */
  approvalId: string | null;
  /** nodeId -> WorkItem id once projected. */
  nodeWorkItemIds: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export const PLAN_LIMITS = {
  maxNodes: 20,
  maxFanOut: 3,
  maxParallel: 3,
  maxDepth: 6,
  minTimeoutMs: 10_000,
  maxTimeoutMs: 1_800_000,
  maxAttempts: 3,
} as const;

export const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Matched case-insensitively against every free-text field of a plan. */
export const INJECTION_MARKERS = [
  'ignore all previous instructions',
  'ignore previous instructions',
  'disregard your instructions',
  'you are now',
  'system prompt:',
  '<|im_start|>',
  'begin instruction',
] as const;

/** Mirrors the ExecutionHostKind union; used to sanitise proposals. */
export const EXECUTION_HOST_KINDS: readonly ExecutionHostKind[] = [
  'attached-webmcp',
  'local-runner',
  'codex-cli',
  'claude-cli',
  'codex-automation-export',
  'manual',
];

/** Capabilities on a human decision that reach outside the sandbox. */
const EXTERNAL_SIDE_EFFECT_CAPABILITIES: readonly RuntimeCapability[] = ['network', 'browser_control'];

export type PlanProblemCode =
  | 'empty_outcome'
  | 'no_nodes'
  | 'too_many_nodes'
  | 'duplicate_id'
  | 'bad_id'
  | 'self_dependency'
  | 'missing_dependency'
  | 'cycle'
  | 'fan_out'
  | 'depth'
  | 'empty_definition_of_done'
  | 'no_verification'
  | 'timeout_range'
  | 'attempts_range'
  | 'unknown_capability'
  | 'forbidden_capability'
  | 'bad_check'
  | 'bad_node'
  | 'no_required_check'
  | 'multiple_worktree_parents'
  | 'injection_marker'
  | 'workspace_mismatch';

export interface PlanProblem {
  code: PlanProblemCode;
  nodeId: string | null;
  message: string;
}

export const PLAN_HASH_FIELDS = ['id', 'workspaceId', 'missionId', 'templateId', 'outcome', 'constraints', 'nodes', 'revision'] as const;

// ---------------- Evaluation reports (recorded by the evaluator, never by the worker) ----------------

export type EvaluationCheckStatus = 'passed' | 'failed' | 'blocked' | 'not_run';

export interface EvaluationCheck {
  id: string;
  kind: VerificationCheckKind;
  required: boolean;
  status: EvaluationCheckStatus;
  detail: string;
  durationMs?: number;
  evidenceRef?: string | null;
}

export const EVALUATION_STATUSES = ['passed', 'failed', 'blocked'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATOR_KINDS = ['cherry-check', 'runner', 'human'] as const;
export type EvaluatorKind = (typeof EVALUATOR_KINDS)[number];

export interface EvaluationReport {
  id: string;
  workspaceId: string;
  missionId: string;
  workItemId: string;
  /** The runner job that produced the artifacts under evaluation, when known. */
  workerRunId: string | null;
  nodeId: string;
  planRevision: number;
  attempt: number;
  status: EvaluationStatus;
  checks: EvaluationCheck[];
  summary: string;
  evaluatorKind: EvaluatorKind;
  contentHash: string;
  createdAt: string;
}

export const EVALUATION_REPORT_HASH_FIELDS = [
  'id', 'workspaceId', 'missionId', 'workItemId', 'workerRunId', 'nodeId', 'planRevision', 'attempt', 'status', 'checks', 'summary', 'evaluatorKind', 'createdAt',
] as const;

export async function computeEvaluationReportHash(report: EvaluationReport): Promise<string> {
  const subject: Record<string, unknown> = {};
  for (const field of EVALUATION_REPORT_HASH_FIELDS) subject[field] = report[field];
  return sha256Canonical(subject);
}

// ---------------- Validation ----------------

function containsInjectionMarker(text: string): boolean {
  const lowered = text.toLowerCase();
  return INJECTION_MARKERS.some((marker) => lowered.includes(marker));
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nodeTexts(node: MissionPlanNode): string[] {
  const checks = Array.isArray(node.verificationPlan) ? node.verificationPlan : [];
  return [
    node.title,
    node.objective,
    ...stringsOf(node.definitionOfDone),
    ...stringsOf(node.contextRefs),
    ...checks.map((check) => check.description ?? ''),
    ...checks.map((check) => check.contains ?? ''),
  ];
}

function validateCheck(check: VerificationCheckSpec): string | null {
  if (typeof check.id !== 'string' || check.id.trim().length === 0) return 'check id is required';
  if (!VERIFICATION_CHECK_KINDS.includes(check.kind)) return `check ${check.id} has an unknown kind`;
  if (typeof check.required !== 'boolean') return `check ${check.id} must state whether it is required`;
  if (typeof check.description !== 'string' || check.description.trim().length === 0) return `check ${check.id} needs a description`;
  const unexpected = (allowed: readonly string[]): string | null => {
    const base = new Set(['id', 'kind', 'required', 'description', ...allowed]);
    return Object.keys(check).find((key) => !base.has(key)) ?? null;
  };
  switch (check.kind) {
    case 'command':
      if (!Array.isArray(check.argv) || check.argv.length === 0 || check.argv.some((part) => typeof part !== 'string' || part.length === 0)) {
        return `command check ${check.id} needs a non-empty argv`;
      }
      if (check.expectExitCode !== undefined && !Number.isInteger(check.expectExitCode)) return `command check ${check.id} has a non-integer exit code`;
      if (unexpected(['argv', 'expectExitCode'])) return `command check ${check.id} carries fields for another check kind`;
      return null;
    case 'file':
      if (typeof check.path !== 'string' || check.path.trim().length === 0) return `${check.kind} check ${check.id} needs a path`;
      if (unexpected(['path'])) return `file check ${check.id} carries fields for another check kind`;
      return null;
    case 'file_contains':
      if (typeof check.path !== 'string' || check.path.trim().length === 0) return `file_contains check ${check.id} needs a path`;
      if (typeof check.contains !== 'string' || check.contains.length === 0) return `file_contains check ${check.id} needs text to look for`;
      if (unexpected(['path', 'contains'])) return `file_contains check ${check.id} carries fields for another check kind`;
      return null;
    case 'hash':
      if (typeof check.path !== 'string' || check.path.trim().length === 0) return `hash check ${check.id} needs a path`;
      if (typeof check.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(check.expectedSha256)) return `hash check ${check.id} needs a sha256 digest`;
      if (unexpected(['path', 'expectedSha256'])) return `hash check ${check.id} carries fields for another check kind`;
      return null;
    case 'human':
      if (check.required !== true) return `human check ${check.id} must be required`;
      if (unexpected([])) return `human check ${check.id} carries executable fields`;
      return null;
  }
}

interface GraphIndex {
  byId: Map<string, MissionPlanNode>;
  /** Existing, non-self dependencies per node id. */
  edges: Map<string, string[]>;
}

function indexGraph(plan: MissionPlan): GraphIndex {
  const byId = new Map<string, MissionPlanNode>();
  for (const node of plan.nodes) if (!byId.has(node.id)) byId.set(node.id, node);
  const edges = new Map<string, string[]>();
  for (const node of byId.values()) {
    edges.set(node.id, stringsOf(node.dependencyIds).filter((dependency) => dependency !== node.id && byId.has(dependency)));
  }
  return { byId, edges };
}

/** Kahn's algorithm in plan order; returns null when a cycle remains. */
function topologicalOrder(graph: GraphIndex): string[] | null {
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const [id, deps] of graph.edges) {
    remaining.set(id, deps.length);
    for (const dependency of deps) {
      const list = dependents.get(dependency) ?? [];
      list.push(id);
      dependents.set(dependency, list);
    }
  }
  const planIndex = new Map([...graph.byId.keys()].map((id, index) => [id, index]));
  const order: string[] = [];
  const queue = [...graph.byId.keys()].filter((id) => remaining.get(id) === 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const left = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, left);
      if (left === 0) queue.push(dependent);
    }
    queue.sort((a, b) => (planIndex.get(a) ?? 0) - (planIndex.get(b) ?? 0));
  }
  return order.length === graph.byId.size ? order : null;
}

/** Longest dependency chain, counted in nodes, over an acyclic graph in topological order. */
function longestChain(graph: GraphIndex, order: string[]): { nodeId: string | null; depth: number } {
  const depth = new Map<string, number>();
  let deepest: { nodeId: string | null; depth: number } = { nodeId: null, depth: 0 };
  for (const id of order) {
    const deps = graph.edges.get(id) ?? [];
    const value = 1 + deps.reduce((max, dependency) => Math.max(max, depth.get(dependency) ?? 0), 0);
    depth.set(id, value);
    if (value > deepest.depth) deepest = { nodeId: id, depth: value };
  }
  return deepest;
}

export function validateMissionPlan(plan: MissionPlan): PlanProblem[] {
  const problems: PlanProblem[] = [];
  const push = (code: PlanProblemCode, nodeId: string | null, message: string): void => {
    problems.push({ code, nodeId, message });
  };

  if (typeof plan.outcome !== 'string' || plan.outcome.trim().length === 0) push('empty_outcome', null, 'The mission needs an outcome.');
  if (typeof plan.workspaceId !== 'string' || plan.workspaceId.length === 0 || typeof plan.missionId !== 'string' || plan.missionId.length === 0) {
    push('workspace_mismatch', null, 'The plan must belong to a workspace and a mission.');
  }
  if (containsInjectionMarker(plan.outcome ?? '') || (plan.constraints ?? []).some((constraint) => containsInjectionMarker(constraint))) {
    push('injection_marker', null, 'The outcome or constraints contain an instruction-injection marker.');
  }

  const nodes = Array.isArray(plan.nodes) ? plan.nodes.filter((node) => typeof node === 'object' && node !== null) : [];
  if (nodes.length === 0) push('no_nodes', null, 'The plan needs at least one node.');
  if (nodes.length > PLAN_LIMITS.maxNodes) push('too_many_nodes', null, `The plan has ${nodes.length} nodes; the limit is ${PLAN_LIMITS.maxNodes}.`);

  const seen = new Set<string>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    if (typeof node.id !== 'string' || !NODE_ID_PATTERN.test(node.id)) push('bad_id', node.id ?? null, `Node id "${String(node.id)}" must match ${NODE_ID_PATTERN.source}.`);
    if (seen.has(node.id)) push('duplicate_id', node.id, `Node id "${node.id}" is used more than once.`);
    seen.add(node.id);
  }

  for (const node of nodes) {
    if (node.missionId !== plan.missionId) push('workspace_mismatch', node.id, `Node "${node.id}" belongs to another mission.`);
    if (!PLAN_NODE_KINDS.includes(node.kind)
      || !PLAN_RISKS.includes(node.riskLevel)
      || !SANDBOX_PROVIDERS.includes(node.sandbox)
      || !Array.isArray(node.preferredHostKinds)
      || node.preferredHostKinds.some((kind) => !EXECUTION_HOST_KINDS.includes(kind))
      || new Set(node.preferredHostKinds).size !== node.preferredHostKinds.length
      || !Array.isArray(node.requiredCapabilities)
      || node.requiredCapabilities.some((capability) => typeof capability !== 'string')
      || new Set(node.requiredCapabilities).size !== node.requiredCapabilities.length) {
      push('bad_node', node.id, `Node "${node.id}" has an invalid kind, risk, sandbox, host, or capability shape.`);
    }
    for (const dependency of stringsOf(node.dependencyIds)) {
      if (dependency === node.id) push('self_dependency', node.id, `Node "${node.id}" depends on itself.`);
      else if (!ids.has(dependency)) push('missing_dependency', node.id, `Node "${node.id}" depends on unknown node "${dependency}".`);
    }
    if (!Array.isArray(node.definitionOfDone) || node.definitionOfDone.filter((line) => typeof line === 'string' && line.trim().length > 0).length === 0) {
      push('empty_definition_of_done', node.id, `Node "${node.id}" needs at least one definition-of-done line.`);
    }
    const checks = Array.isArray(node.verificationPlan) ? node.verificationPlan : [];
    if (checks.length === 0) push('no_verification', node.id, `Node "${node.id}" needs at least one verification check.`);
    const checkIds = new Set<string>();
    for (const check of checks) {
      const problem = validateCheck(check);
      if (problem) push('bad_check', node.id, `Node "${node.id}": ${problem}.`);
      else if (checkIds.has(check.id)) push('bad_check', node.id, `Node "${node.id}": check id "${check.id}" is duplicated.`);
      checkIds.add(check.id);
    }
    if (node.kind !== 'human_decision' && checks.length > 0 && !checks.some((check) => check?.required === true)) {
      push('no_required_check', node.id, `Node "${node.id}" needs at least one required verification check.`);
    }
    if (node.kind === 'human_decision') {
      if (checks.length > 0 && (checks.length !== 1 || checks[0]!.kind !== 'human')) push('bad_check', node.id, `Node "${node.id}" is a human decision and carries exactly one human check.`);
      if (node.sandbox !== 'none' || node.preferredHostKinds.length !== 0 || node.requiredCapabilities.length !== 1 || node.requiredCapabilities[0] !== 'human_approval') {
        push('bad_node', node.id, `Node "${node.id}" is a human decision and must use sandbox none, no automatic host, and only human_approval.`);
      }
    } else if (checks.some((check) => check.kind === 'human')) {
      push('bad_check', node.id, `Node "${node.id}" is not a human decision and cannot carry a human check.`);
    } else if (node.sandbox === 'none') {
      push('bad_node', node.id, `Node "${node.id}" is executable and cannot use sandbox none.`);
    }
    if (!Number.isInteger(node.timeoutMs) || node.timeoutMs < PLAN_LIMITS.minTimeoutMs || node.timeoutMs > PLAN_LIMITS.maxTimeoutMs) {
      push('timeout_range', node.id, `Node "${node.id}" timeout must be between ${PLAN_LIMITS.minTimeoutMs} and ${PLAN_LIMITS.maxTimeoutMs} ms.`);
    }
    if (!Number.isInteger(node.maxAttempts) || node.maxAttempts < 1 || node.maxAttempts > PLAN_LIMITS.maxAttempts) {
      push('attempts_range', node.id, `Node "${node.id}" attempts must be between 1 and ${PLAN_LIMITS.maxAttempts}.`);
    }
    for (const capability of stringsOf(node.requiredCapabilities) as RuntimeCapability[]) {
      if (!RUNTIME_CAPABILITIES.includes(capability)) push('unknown_capability', node.id, `Node "${node.id}" requires unknown capability "${String(capability)}".`);
      else if (capability === 'human_approval' && node.kind !== 'human_decision') push('forbidden_capability', node.id, `Node "${node.id}" may not request human_approval; only a human decision node can.`);
    }
    if (nodeTexts(node).some((text) => typeof text === 'string' && containsInjectionMarker(text))) {
      push('injection_marker', node.id, `Node "${node.id}" contains an instruction-injection marker.`);
    }
  }

  const graph = indexGraph(plan);
  for (const node of graph.byId.values()) {
    const worktreeParents = (graph.edges.get(node.id) ?? []).filter((dependencyId) => graph.byId.get(dependencyId)?.sandbox === 'git-worktree');
    if (node.sandbox === 'git-worktree' && worktreeParents.length > 1) {
      push('multiple_worktree_parents', node.id, `Node "${node.id}" has multiple worktree parents and no merge contract.`);
    }
  }
  const children = new Map<string, number>();
  for (const deps of graph.edges.values()) {
    for (const dependency of deps) children.set(dependency, (children.get(dependency) ?? 0) + 1);
  }
  for (const [id, count] of children) {
    if (count > PLAN_LIMITS.maxFanOut) push('fan_out', id, `Node "${id}" fans out to ${count} nodes; the limit is ${PLAN_LIMITS.maxFanOut}.`);
  }
  const order = topologicalOrder(graph);
  if (order === null) {
    push('cycle', null, 'The plan contains a dependency cycle.');
  } else {
    const chain = longestChain(graph, order);
    if (chain.depth > PLAN_LIMITS.maxDepth) push('depth', chain.nodeId, `The dependency chain ending at "${chain.nodeId}" is ${chain.depth} nodes deep; the limit is ${PLAN_LIMITS.maxDepth}.`);
  }
  return problems;
}

/** Plan order for independent nodes, dependencies first. Throws on a cycle. */
export function planTopologicalOrder(plan: MissionPlan): string[] {
  const order = topologicalOrder(indexGraph(plan));
  if (order === null) throw new Error('Mission plan has a dependency cycle');
  return order;
}

export async function computePlanContentHash(plan: MissionPlan): Promise<string> {
  const subject: Record<string, unknown> = {};
  for (const field of PLAN_HASH_FIELDS) subject[field] = plan[field];
  return sha256Canonical(subject);
}

/**
 * A node that works inside a repository records the approved root as a context
 * reference. The reference is part of the hashed content, so a changed root
 * invalidates the approval like any other edit.
 */
export const REPOSITORY_ROOT_CONTEXT_PREFIX = 'repository-root:';

export function repositoryRootFromNode(node: MissionPlanNode): string | null {
  const reference = node.contextRefs.find((ref) => ref.startsWith(REPOSITORY_ROOT_CONTEXT_PREFIX));
  const root = reference ? reference.slice(REPOSITORY_ROOT_CONTEXT_PREFIX.length).trim() : '';
  return root.length > 0 ? root : null;
}

/** Declared output files: every path a deterministic check will look at. */
export function planNodeOutputs(node: MissionPlanNode): string[] {
  const outputs: string[] = [];
  for (const check of node.verificationPlan) {
    if (check.path && !outputs.includes(check.path)) outputs.push(check.path);
  }
  return outputs;
}

export function requiresApproval(plan: MissionPlan): boolean {
  return plan.nodes.some((node) => node.riskLevel === 'high' || node.riskLevel === 'critical')
    || plan.nodes.some((node) => node.kind === 'human_decision' && node.requiredCapabilities.some((capability) => EXTERNAL_SIDE_EFFECT_CAPABILITIES.includes(capability)));
}

// ---------------- Run status derivation ----------------

export type PlanNodeRunStatus = 'pending' | 'ready' | 'running' | 'waiting_for_human' | 'verifying' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';

const WORK_ITEM_TO_NODE_STATUS: Readonly<Record<WorkItemStatus, PlanNodeRunStatus>> = {
  DRAFT: 'pending',
  READY: 'pending',
  QUEUED: 'ready',
  LEASED: 'ready',
  RUNNING: 'running',
  WAITING_FOR_HUMAN: 'waiting_for_human',
  WAITING_FOR_DEPENDENCY: 'pending',
  RETRYING: 'running',
  VERIFYING: 'verifying',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export function planNodeStatusFromWorkItem(status: WorkItemStatus): PlanNodeRunStatus {
  return WORK_ITEM_TO_NODE_STATUS[status];
}

const BLOCKING_STATUSES: readonly PlanNodeRunStatus[] = ['failed', 'blocked', 'cancelled'];

/** Marks pending nodes as blocked when any dependency failed, was blocked or was cancelled. */
export function deriveNodeRunStatuses(plan: MissionPlan, statuses: Readonly<Record<string, PlanNodeRunStatus>>): Record<string, PlanNodeRunStatus> {
  const graph = indexGraph(plan);
  const order = topologicalOrder(graph) ?? [...graph.byId.keys()];
  const derived: Record<string, PlanNodeRunStatus> = {};
  for (const id of order) {
    const current = statuses[id] ?? 'pending';
    const deps = graph.edges.get(id) ?? [];
    derived[id] = current === 'pending' && deps.some((dependency) => BLOCKING_STATUSES.includes(derived[dependency] ?? 'pending')) ? 'blocked' : current;
  }
  return derived;
}

/** Pending nodes whose dependencies have all succeeded, in plan order. */
export function computeReadyNodeIds(plan: MissionPlan, statuses: Readonly<Record<string, PlanNodeRunStatus>>): string[] {
  const graph = indexGraph(plan);
  const ready: string[] = [];
  for (const node of graph.byId.values()) {
    if ((statuses[node.id] ?? 'pending') !== 'pending') continue;
    const deps = graph.edges.get(node.id) ?? [];
    if (deps.every((dependency) => statuses[dependency] === 'succeeded')) ready.push(node.id);
  }
  return ready;
}

export function derivePlanStatus(plan: MissionPlan, statuses: Readonly<Record<string, PlanNodeRunStatus>>): MissionPlanStatus {
  const derived = Object.values(deriveNodeRunStatuses(plan, statuses));
  if (derived.length > 0 && derived.every((status) => status === 'succeeded')) return 'succeeded';
  if (derived.includes('waiting_for_human')) return 'waiting_for_human';
  const active = derived.some((status) => status === 'running' || status === 'ready' || status === 'verifying');
  // A failed node whose dependants were cancelled because of it is a failed mission, not a cancelled one.
  if (derived.includes('failed') && !active) return 'failed';
  if (derived.includes('cancelled')) return 'cancelled';
  if (derived.includes('verifying')) return 'verifying';
  if (derived.some((status) => status === 'running' || status === 'ready')) return 'running';
  return plan.status;
}

// ---------------- Proposal sanitisation ----------------

/** Keys a model proposal may never carry: a plan describes work, not commands. */
const FORBIDDEN_PROPOSAL_KEYS = new Set(['command', 'argv', 'shell', 'executable']);

export interface PlanProposalContext {
  workspaceId: string;
  missionId: string;
  planId?: string;
  now?: string;
}

export interface SanitizedPlanProposal {
  plan: MissionPlan | null;
  problems: PlanProblem[];
  /** JSON paths of the keys that were removed. */
  stripped: string[];
  droppedCapabilities: string[];
  error: string | null;
}

type Unknown = Record<string, unknown>;

function isRecord(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripForbiddenKeys(value: unknown, path: string, stripped: string[]): unknown {
  if (Array.isArray(value)) return value.map((item, index) => stripForbiddenKeys(item, `${path}[${index}]`, stripped));
  if (!isRecord(value)) return value;
  const cleaned: Unknown = {};
  for (const [key, inner] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PROPOSAL_KEYS.has(key)) {
      stripped.push(keyPath);
      continue;
    }
    cleaned[key] = stripForbiddenKeys(inner, keyPath, stripped);
  }
  return cleaned;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? value as T : null;
}

function buildCheck(raw: Unknown): VerificationCheckSpec {
  const check: VerificationCheckSpec = {
    id: text(raw['id']),
    kind: text(raw['kind']) as VerificationCheckKind,
    required: typeof raw['required'] === 'boolean' ? raw['required'] : true,
    description: text(raw['description']),
  };
  if (Number.isInteger(raw['expectExitCode'])) check.expectExitCode = raw['expectExitCode'] as number;
  if (typeof raw['path'] === 'string') check.path = raw['path'];
  if (typeof raw['contains'] === 'string') check.contains = raw['contains'];
  if (typeof raw['expectedSha256'] === 'string') check.expectedSha256 = raw['expectedSha256'];
  return check;
}

function buildNode(raw: Unknown, missionId: string, droppedCapabilities: string[]): MissionPlanNode {
  const kind = oneOf(raw['kind'], PLAN_NODE_KINDS) ?? 'agent';
  const capabilities: RuntimeCapability[] = [];
  for (const capability of textArray(raw['requiredCapabilities'])) {
    if ((RUNTIME_CAPABILITIES as readonly string[]).includes(capability)) {
      if (!capabilities.includes(capability as RuntimeCapability)) capabilities.push(capability as RuntimeCapability);
    } else if (!droppedCapabilities.includes(capability)) {
      droppedCapabilities.push(capability);
    }
  }
  return {
    id: text(raw['id']),
    missionId,
    title: text(raw['title']).trim(),
    objective: text(raw['objective']).trim(),
    definitionOfDone: textArray(raw['definitionOfDone']).map((line) => line.trim()).filter(Boolean),
    dependencyIds: [...new Set(textArray(raw['dependencyIds']))],
    kind,
    preferredAgentProfileId: typeof raw['preferredAgentProfileId'] === 'string' ? raw['preferredAgentProfileId'] : null,
    preferredHostKinds: textArray(raw['preferredHostKinds']).filter((value): value is ExecutionHostKind => (EXECUTION_HOST_KINDS as readonly string[]).includes(value)),
    requiredCapabilities: capabilities,
    // An unknown risk fails closed to high rather than silently lowering the bar.
    riskLevel: oneOf(raw['riskLevel'], PLAN_RISKS) ?? 'high',
    verificationPlan: Array.isArray(raw['verificationPlan']) ? raw['verificationPlan'].filter(isRecord).map(buildCheck) : [],
    contextRefs: textArray(raw['contextRefs']),
    maxAttempts: Number.isInteger(raw['maxAttempts']) ? raw['maxAttempts'] as number : 1,
    timeoutMs: Number.isInteger(raw['timeoutMs']) ? raw['timeoutMs'] as number : 300_000,
    sandbox: oneOf(raw['sandbox'], SANDBOX_PROVIDERS) ?? (kind === 'human_decision' ? 'none' : 'directory'),
  };
}

/**
 * Turns an untrusted proposal (a model's JSON, a pasted document) into a plan
 * bound to this workspace and mission. Unknown fields and capabilities are
 * dropped, command-like keys are removed and reported, and the result must
 * pass validateMissionPlan. Pure: the caller persists and hashes.
 */
export function sanitizePlanProposalDetailed(raw: unknown, context: PlanProposalContext): SanitizedPlanProposal {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { plan: null, problems: [], stripped: [], droppedCapabilities: [], error: 'The proposal is not valid JSON.' };
    }
  }
  if (!isRecord(value)) return { plan: null, problems: [], stripped: [], droppedCapabilities: [], error: 'The proposal must be a JSON object.' };

  const stripped: string[] = [];
  const cleaned = stripForbiddenKeys(value, '', stripped) as Unknown;
  const droppedCapabilities: string[] = [];
  const now = context.now ?? isoNow();
  const plan: MissionPlan = {
    id: context.planId ?? newId('pl'),
    workspaceId: context.workspaceId,
    missionId: context.missionId,
    templateId: typeof cleaned['templateId'] === 'string' ? cleaned['templateId'] : null,
    outcome: text(cleaned['outcome']).trim(),
    constraints: textArray(cleaned['constraints']).map((line) => line.trim()).filter(Boolean),
    nodes: Array.isArray(cleaned['nodes']) ? cleaned['nodes'].filter(isRecord).map((node) => buildNode(node, context.missionId, droppedCapabilities)) : [],
    status: 'draft',
    revision: 1,
    contentHash: '',
    approvalId: null,
    nodeWorkItemIds: {},
    createdAt: now,
    updatedAt: now,
  };
  const problems = validateMissionPlan(plan);
  return { plan: problems.length === 0 ? plan : null, problems, stripped, droppedCapabilities, error: null };
}

export function sanitizePlanProposal(raw: unknown, context: PlanProposalContext): Result<MissionPlan> {
  const sanitised = sanitizePlanProposalDetailed(raw, context);
  if (sanitised.error) return fail('validation', sanitised.error, { stripped: sanitised.stripped });
  if (!sanitised.plan) {
    return fail('validation', `The proposal is not a valid mission plan (${sanitised.problems.map((problem) => problem.code).join(', ')}).`, {
      problems: sanitised.problems,
      stripped: sanitised.stripped,
      droppedCapabilities: sanitised.droppedCapabilities,
    });
  }
  return ok(sanitised.plan);
}
