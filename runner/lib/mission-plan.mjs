/**
 * Mission plan model for the runner. Mirrors the TypeScript contract in
 * src/cherry/workforce/mission-plan-model.ts (ARCHITECTURE.md section 3.1):
 * the same problem codes, limits, capability list and injection markers, so
 * both validators agree on every fixture in tests/fixtures/mission-plans.
 */
import { canonicalize, sha256Hex } from './canonical.mjs';

export const PLAN_LIMITS = Object.freeze({
  maxNodes: 20,
  maxFanOut: 3,
  maxParallel: 3,
  maxDepth: 6,
  minTimeoutMs: 10_000,
  maxTimeoutMs: 1_800_000,
  maxAttempts: 3,
});

/** Mirrors RUNTIME_CAPABILITIES in src/cherry/workforce/workforce-model.ts. */
export const RUNTIME_CAPABILITIES = Object.freeze([
  'page_tools',
  'repository_read',
  'repository_write',
  'command_execution',
  'browser_vision',
  'browser_control',
  'background',
  'schedule',
  'network',
  'human_approval',
  'artifact_write',
  'verification',
]);

export const INJECTION_MARKERS = Object.freeze([
  'ignore all previous instructions',
  'ignore previous instructions',
  'disregard your instructions',
  'you are now',
  'system prompt:',
  '<|im_start|>',
  'begin instruction',
]);

export const PLAN_HASH_FIELDS = Object.freeze(['id', 'workspaceId', 'missionId', 'templateId', 'outcome', 'constraints', 'nodes', 'revision']);

export const NODE_KINDS = new Set(['agent', 'verify', 'human_decision']);
const CHECK_KINDS = new Set(['command', 'file', 'file_contains', 'hash', 'human']);
const NODE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NODE_STATUSES_DONE = new Set(['succeeded']);
const NODE_STATUSES_BLOCKING = new Set(['failed', 'blocked', 'cancelled']);

const asArray = (value) => (Array.isArray(value) ? value : []);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

function hasInjectionMarker(text) {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return INJECTION_MARKERS.some((marker) => lower.includes(marker));
}

function nodeTexts(node) {
  return [node.title, node.objective, ...asArray(node.definitionOfDone), ...asArray(node.contextRefs), ...asArray(node.verificationPlan).map((check) => check?.description)];
}

function checkProblem(check) {
  if (!check || typeof check !== 'object') return 'a check must be an object';
  if (!CHECK_KINDS.has(check.kind)) return `unknown check kind ${String(check.kind)}`;
  if (check.kind === 'command' && !(asArray(check.argv).length > 0 && check.argv.every(nonEmpty))) return `command check ${check.id ?? '?'} needs a non-empty argv`;
  if (['file', 'file_contains', 'hash'].includes(check.kind) && !nonEmpty(check.path)) return `${check.kind} check ${check.id ?? '?'} needs a path`;
  return null;
}

/**
 * Longest dependency chain, counted in nodes, for an acyclic plan.
 * A single node has depth 1; depth.json (a chain of 8) exceeds maxDepth 6.
 */
function longestChain(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const memo = new Map();
  const depthOf = (id, stack) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const node = byId.get(id);
    let best = 0;
    for (const dependency of asArray(node?.dependencyIds)) {
      if (byId.has(dependency)) best = Math.max(best, depthOf(dependency, stack));
    }
    stack.delete(id);
    memo.set(id, best + 1);
    return best + 1;
  };
  let longest = 0;
  for (const node of nodes) longest = Math.max(longest, depthOf(node.id, new Set()));
  return longest;
}

/** Kahn's algorithm in plan order; returns null when a cycle remains. */
function topologicalOrder(nodes) {
  const ids = nodes.map((node) => node.id);
  const known = new Set(ids);
  const remaining = new Map(nodes.map((node) => [node.id, new Set(asArray(node.dependencyIds).filter((dependency) => known.has(dependency) && dependency !== node.id))]));
  const order = [];
  const done = new Set();
  let progressed = true;
  while (progressed && order.length < ids.length) {
    progressed = false;
    for (const id of ids) {
      if (done.has(id)) continue;
      const pending = [...remaining.get(id)].filter((dependency) => !done.has(dependency));
      if (pending.length === 0) {
        order.push(id);
        done.add(id);
        progressed = true;
      }
    }
  }
  return order.length === ids.length ? order : null;
}

/** Returns PlanProblem[]; an empty array means the plan is valid. */
export function validateMissionPlan(plan) {
  const problems = [];
  const push = (code, nodeId, message) => problems.push({ code, nodeId, message });
  if (!plan || typeof plan !== 'object') return [{ code: 'no_nodes', nodeId: null, message: 'the plan must be an object' }];
  if (!nonEmpty(plan.outcome)) push('empty_outcome', null, 'the outcome must not be empty');
  for (const text of [plan.outcome, ...asArray(plan.constraints)]) {
    if (hasInjectionMarker(text)) push('injection_marker', null, 'plan text carries an instruction-injection marker');
  }
  const nodes = asArray(plan.nodes).filter((node) => node && typeof node === 'object');
  if (nodes.length === 0) {
    push('no_nodes', null, 'a plan needs at least one node');
    return problems;
  }
  if (nodes.length > PLAN_LIMITS.maxNodes) push('too_many_nodes', null, `a plan may have at most ${PLAN_LIMITS.maxNodes} nodes`);

  const seen = new Set();
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map();
  for (const node of nodes) {
    const id = typeof node.id === 'string' ? node.id : String(node.id);
    if (seen.has(id)) push('duplicate_id', id, `node id ${id} is used more than once`);
    seen.add(id);
    if (!NODE_ID.test(id)) push('bad_id', id, `node id ${JSON.stringify(id)} must match ^[a-z0-9][a-z0-9-]{0,39}$`);
    for (const dependency of asArray(node.dependencyIds)) {
      if (dependency === id) push('self_dependency', id, `node ${id} depends on itself`);
      else if (!ids.has(dependency)) push('missing_dependency', id, `node ${id} depends on unknown node ${dependency}`);
      else children.set(dependency, (children.get(dependency) ?? 0) + 1);
    }
    if (asArray(node.definitionOfDone).filter(nonEmpty).length === 0) push('empty_definition_of_done', id, `node ${id} needs at least one definition-of-done line`);
    const checks = asArray(node.verificationPlan);
    if (checks.length === 0) push('no_verification', id, `node ${id} needs at least one verification check`);
    for (const check of checks) {
      const problem = checkProblem(check);
      if (problem) push('bad_check', id, `node ${id}: ${problem}`);
    }
    if (!Number.isInteger(node.timeoutMs) || node.timeoutMs < PLAN_LIMITS.minTimeoutMs || node.timeoutMs > PLAN_LIMITS.maxTimeoutMs) {
      push('timeout_range', id, `node ${id} timeout must be between ${PLAN_LIMITS.minTimeoutMs} and ${PLAN_LIMITS.maxTimeoutMs} ms`);
    }
    if (!Number.isInteger(node.maxAttempts) || node.maxAttempts < 1 || node.maxAttempts > PLAN_LIMITS.maxAttempts) {
      push('attempts_range', id, `node ${id} maxAttempts must be between 1 and ${PLAN_LIMITS.maxAttempts}`);
    }
    for (const capability of asArray(node.requiredCapabilities)) {
      if (!RUNTIME_CAPABILITIES.includes(capability)) push('unknown_capability', id, `node ${id} requires unknown capability ${String(capability)}`);
      else if (capability === 'human_approval' && node.kind !== 'human_decision') push('forbidden_capability', id, `node ${id} may not require human_approval unless it is a human_decision node`);
    }
    if (nodeTexts(node).some(hasInjectionMarker)) push('injection_marker', id, `node ${id} text carries an instruction-injection marker`);
  }
  for (const [parent, count] of children) {
    if (count > PLAN_LIMITS.maxFanOut) push('fan_out', parent, `node ${parent} has ${count} dependents; at most ${PLAN_LIMITS.maxFanOut} are allowed`);
  }
  const hasDuplicates = seen.size !== nodes.length;
  if (!hasDuplicates) {
    if (topologicalOrder(nodes) === null) {
      push('cycle', null, 'the dependency graph has a cycle');
    } else {
      const depth = longestChain(nodes);
      if (depth > PLAN_LIMITS.maxDepth) push('depth', null, `the longest dependency chain has ${depth} nodes; at most ${PLAN_LIMITS.maxDepth} are allowed`);
    }
  }
  return problems;
}

/** Node ids in dependency order (plan order among peers). Throws on a cycle. */
export function planTopologicalOrder(plan) {
  const order = topologicalOrder(asArray(plan?.nodes));
  if (order === null) throw new Error('the mission plan has a dependency cycle');
  return order;
}

/** Pending nodes whose dependencies all succeeded, in topological order. */
export function computeReadyNodeIds(plan, statuses) {
  const nodes = asArray(plan?.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return planTopologicalOrder(plan).filter((id) => {
    if ((statuses[id] ?? 'pending') !== 'pending') return false;
    return asArray(byId.get(id).dependencyIds).every((dependency) => NODE_STATUSES_DONE.has(statuses[dependency]));
  });
}

/** Pending nodes with a failed, blocked or cancelled dependency. */
export function computeBlockedNodeIds(plan, statuses) {
  return asArray(plan?.nodes)
    .filter((node) => (statuses[node.id] ?? 'pending') === 'pending' && asArray(node.dependencyIds).some((dependency) => NODE_STATUSES_BLOCKING.has(statuses[dependency])))
    .map((node) => node.id);
}

/** Mission status from node statuses, as ARCHITECTURE.md section 3.1 derives it. */
export function derivePlanStatus(plan, statuses, persisted) {
  const values = asArray(plan?.nodes).map((node) => statuses[node.id] ?? 'pending');
  if (values.length > 0 && values.every((status) => status === 'succeeded')) return 'succeeded';
  if (values.includes('waiting_for_human')) return 'waiting_for_human';
  if (values.includes('cancelled')) return 'cancelled';
  const active = values.some((status) => ['running', 'ready', 'verifying'].includes(status));
  if (values.includes('failed') && !active) return 'failed';
  if (values.includes('verifying')) return 'verifying';
  if (values.some((status) => status === 'running' || status === 'ready')) return 'running';
  return persisted;
}

/**
 * Plan content hash: SHA-256 hex over the canonical JSON (sorted keys, JCS
 * style, undefined dropped) of an object holding exactly PLAN_HASH_FIELDS
 * taken from the plan: id, workspaceId, missionId, templateId, outcome,
 * constraints, nodes, revision. Nothing else (status, contentHash,
 * approvalId, timestamps, nodeWorkItemIds) takes part. The browser computes
 * sha256Canonical over the same picked object and must produce the same hex.
 */
export function computePlanContentHash(plan) {
  const picked = {};
  for (const field of PLAN_HASH_FIELDS) picked[field] = plan[field];
  return sha256Hex(canonicalize(picked));
}
