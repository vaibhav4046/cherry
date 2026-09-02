/**
 * Mission orchestration, pure. Translates runner node events into legal
 * work-item transitions and derives the summary Mission Control shows. The
 * integrator applies the transitions through transitionWorkItem; nothing here
 * touches storage. SUCCEEDED is reachable only through a passed evaluation
 * report, never through provider completion.
 */

import { canTransition, type WorkItem, type WorkItemStatus } from './workforce-model.ts';
import {
  computeReadyNodeIds,
  deriveNodeRunStatuses,
  derivePlanStatus,
  planNodeStatusFromWorkItem,
  planTopologicalOrder,
  requiresApproval,
  type EvaluationReport,
  type MissionPlan,
  type MissionPlanNode,
  type MissionPlanStatus,
  type PlanNodeRunStatus,
} from './mission-plan-model.ts';

export type RunnerNodeEvent =
  | { type: 'started'; hostId?: string | null }
  | { type: 'completed' }
  | { type: 'verified'; report: EvaluationReport | null }
  | { type: 'verification_failed'; attempt: number; report?: EvaluationReport | null }
  | { type: 'needs_human'; question?: string }
  | { type: 'cancelled'; reason?: string }
  | { type: 'blocked'; reason?: string };

export interface NodeEventOutcome {
  /** Transitions to apply in order; every step is legal per WORK_ITEM_TRANSITIONS. */
  transitions: WorkItemStatus[];
  /** Why nothing (or less) happened; null when the event was applied in full. */
  refused: string | null;
}

const TERMINAL: readonly WorkItemStatus[] = ['SUCCEEDED', 'CANCELLED'];

/** Legal path from any state into RUNNING. */
function pathToRunning(from: WorkItemStatus): WorkItemStatus[] | null {
  switch (from) {
    case 'DRAFT': return ['READY', 'QUEUED', 'LEASED', 'RUNNING'];
    case 'READY':
    case 'WAITING_FOR_HUMAN':
    case 'WAITING_FOR_DEPENDENCY':
    case 'RETRYING':
    case 'FAILED': return ['QUEUED', 'LEASED', 'RUNNING'];
    case 'QUEUED': return ['LEASED', 'RUNNING'];
    case 'LEASED': return ['RUNNING'];
    case 'RUNNING': return [];
    case 'VERIFYING': return ['RETRYING', 'QUEUED', 'LEASED', 'RUNNING'];
    case 'SUCCEEDED':
    case 'CANCELLED': return null;
  }
}

/** Legal path from any state into VERIFYING. */
function pathToVerifying(from: WorkItemStatus): WorkItemStatus[] | null {
  if (from === 'VERIFYING') return [];
  const running = pathToRunning(from);
  return running === null ? null : [...running, 'VERIFYING'];
}

function refuse(reason: string): NodeEventOutcome {
  return { transitions: [], refused: reason };
}

function applied(transitions: WorkItemStatus[]): NodeEventOutcome {
  return { transitions, refused: null };
}

function assertLegal(from: WorkItemStatus, transitions: WorkItemStatus[]): WorkItemStatus[] {
  let current = from;
  for (const next of transitions) {
    if (!canTransition(current, next)) throw new Error(`Illegal work-item transition ${current} -> ${next}`);
    current = next;
  }
  return transitions;
}

function nodeForWorkItem(plan: MissionPlan, workItem: WorkItem): MissionPlanNode | null {
  const nodeId = Object.keys(plan.nodeWorkItemIds).find((id) => plan.nodeWorkItemIds[id] === workItem.id);
  return nodeId ? plan.nodes.find((node) => node.id === nodeId) ?? null : null;
}

export function applyRunnerNodeEvent(plan: MissionPlan, workItem: WorkItem, event: RunnerNodeEvent): NodeEventOutcome {
  if (workItem.workspaceId !== plan.workspaceId) return refuse('The work item belongs to another workspace.');
  if (workItem.missionId !== plan.missionId) return refuse('The work item belongs to another mission.');
  const node = nodeForWorkItem(plan, workItem);
  if (!node) return refuse('The work item is not projected from this plan.');
  const from = workItem.status;
  if (TERMINAL.includes(from)) {
    return event.type === 'cancelled' || event.type === 'blocked' ? applied([]) : refuse(`The work item is already ${from}.`);
  }

  switch (event.type) {
    case 'started': {
      const path = pathToRunning(from);
      return path === null ? refuse(`Cannot start from ${from}.`) : applied(assertLegal(from, path));
    }
    case 'completed': {
      // Provider completion is not verification: the node only moves to VERIFYING.
      const path = pathToVerifying(from);
      return path === null ? refuse(`Cannot complete from ${from}.`) : applied(assertLegal(from, path));
    }
    case 'verified': {
      const report = event.report;
      if (!report) return refuse('SUCCEEDED requires an evaluation report; none was supplied.');
      if (report.workItemId !== workItem.id || report.nodeId !== node.id) return refuse('The evaluation report belongs to a different node.');
      if (report.status !== 'passed') return refuse(`The evaluation report status is ${report.status}, not passed.`);
      const path = pathToVerifying(from);
      return path === null ? refuse(`Cannot verify from ${from}.`) : applied(assertLegal(from, [...path, 'SUCCEEDED']));
    }
    case 'verification_failed': {
      const next: WorkItemStatus = event.attempt < node.maxAttempts ? 'RETRYING' : 'FAILED';
      if (from === 'RUNNING' || from === 'VERIFYING') return applied(assertLegal(from, [next]));
      if (from === 'RETRYING' || from === 'FAILED') return applied([]);
      const path = pathToRunning(from);
      return path === null ? refuse(`Cannot fail from ${from}.`) : applied(assertLegal(from, [...path, next]));
    }
    case 'needs_human': {
      if (from === 'WAITING_FOR_HUMAN') return applied([]);
      const path = pathToRunning(from);
      return path === null ? refuse(`Cannot wait for a person from ${from}.`) : applied(assertLegal(from, [...path, 'WAITING_FOR_HUMAN']));
    }
    case 'cancelled':
    case 'blocked': {
      if (from === 'VERIFYING') return applied(assertLegal(from, ['FAILED', 'CANCELLED']));
      if (from === 'DRAFT') return applied(assertLegal(from, ['READY', 'CANCELLED']));
      return applied(assertLegal(from, ['CANCELLED']));
    }
  }
}

// ---------------- Summary for Mission Control ----------------

export type VerificationSummaryStatus = 'not_started' | 'checking' | 'passed' | 'failed' | 'mixed';

export interface MissionSummary {
  status: MissionPlanStatus;
  nodeStatuses: Record<string, PlanNodeRunStatus>;
  readyNodeIds: string[];
  /** Work items a host is currently working on (LEASED or RUNNING). */
  activeWorkers: number;
  /** Host ids named by the active work items, sorted. */
  hosts: string[];
  /** The next node the mission is waiting on, in dependency order. */
  nextDependency: string | null;
  /** Plan approval still missing plus human decisions waiting right now. */
  pendingApprovals: number;
  verificationStatus: VerificationSummaryStatus;
  lastEventAt: string | null;
}

const ACTIVE_STATUSES: readonly WorkItemStatus[] = ['LEASED', 'RUNNING'];

export function deriveMissionSummary(plan: MissionPlan, workItems: readonly WorkItem[]): MissionSummary {
  const itemsById = new Map(workItems.map((item) => [item.id, item]));
  const rawStatuses: Record<string, PlanNodeRunStatus> = {};
  const nodeItems = new Map<string, WorkItem>();
  for (const node of plan.nodes) {
    const item = itemsById.get(plan.nodeWorkItemIds[node.id] ?? '');
    if (item) nodeItems.set(node.id, item);
    rawStatuses[node.id] = item ? planNodeStatusFromWorkItem(item.status) : 'pending';
  }
  const nodeStatuses = deriveNodeRunStatuses(plan, rawStatuses);
  const active = [...nodeItems.values()].filter((item) => ACTIVE_STATUSES.includes(item.status));
  const hosts = [...new Set(active.map((item) => item.executionHostId).filter((hostId): hostId is string => typeof hostId === 'string'))].sort();

  let order: string[];
  try {
    order = planTopologicalOrder(plan);
  } catch {
    order = plan.nodes.map((node) => node.id);
  }
  const nextDependency = order.find((nodeId) => nodeStatuses[nodeId] !== 'succeeded') ?? null;

  const waitingDecisions = plan.nodes.filter((node) => node.kind === 'human_decision' && nodeStatuses[node.id] === 'waiting_for_human').length;
  const pendingApprovals = waitingDecisions + (plan.approvalId === null && requiresApproval(plan) ? 1 : 0);

  const verifyStatuses = plan.nodes.filter((node) => node.kind === 'verify').map((node) => nodeStatuses[node.id] ?? 'pending');
  let verificationStatus: VerificationSummaryStatus = 'not_started';
  if (verifyStatuses.some((status) => status === 'failed' || status === 'blocked')) verificationStatus = 'failed';
  else if (verifyStatuses.some((status) => status === 'running' || status === 'ready' || status === 'verifying')) verificationStatus = 'checking';
  else if (verifyStatuses.length > 0 && verifyStatuses.every((status) => status === 'succeeded')) verificationStatus = 'passed';
  else if (verifyStatuses.some((status) => status === 'succeeded')) verificationStatus = 'mixed';

  const lastEventAt = [...nodeItems.values()].reduce<string | null>((latest, item) => latest === null || item.updatedAt > latest ? item.updatedAt : latest, null);

  return {
    status: derivePlanStatus(plan, rawStatuses),
    nodeStatuses,
    readyNodeIds: computeReadyNodeIds(plan, rawStatuses),
    activeWorkers: active.length,
    hosts,
    nextDependency,
    pendingApprovals,
    verificationStatus,
    lastEventAt,
  };
}
