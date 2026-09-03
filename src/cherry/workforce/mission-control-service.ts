/**
 * Mission Control operations shared by the UI and the WebMCP mission tools.
 * Composes the plan, orchestrator, host registry and runner client into the
 * few verbs a person or an agent actually uses: create, plan, start, sync,
 * cancel, decide. Every state change goes through the domain services, so
 * ProofEvents land in the same transaction; the runner binding lives in the
 * settings table and never in the hashed plan.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { isoNow } from '../core/clock.ts';
import { fail, ok, type Result } from '../core/result.ts';
import type { ActorType } from '../core/domain-event.ts';
import type { Mission } from '../mission/mission-model.ts';
import { getMission, listMissions } from '../mission/mission-service.ts';
import {
  cancelRunnerMission,
  decideRunnerMission,
  getRunnerMission,
  listRunnerHosts,
  runnerStatus,
  startRunnerMission,
  submitRunnerMission,
  type RunnerHostProbe,
  type RunnerMission,
  type RunnerMissionNode,
} from '../runner-client/runner-api.ts';
import { getWorkItem, listWorkItems, transitionWorkItem } from './workforce-service.ts';
import type { ExecutionHost, WorkItem } from './workforce-model.ts';
import {
  computePlanContentHash,
  computeReadyNodeIds,
  planNodeStatusFromWorkItem,
  validateMissionPlan,
  type EvaluationReport,
  type MissionPlan,
  type MissionPlanNode,
  type PlanNodeRunStatus,
} from './mission-plan-model.ts';
import {
  approvePlan,
  buildNodeEnvelopes,
  createOutcomeMission,
  getMissionPlan,
  getPlanForMission,
  listMissionPlans,
  projectPlanToWorkItems,
  recordPlanStatus,
  requiresApproval,
  type MissionCreatorType,
} from './mission-plan-service.ts';
import { applyRunnerNodeEvent, deriveMissionSummary, type RunnerNodeEvent } from './mission-orchestrator.ts';
import { hostBoundary, probeToExecutionHost } from './host-registry-service.ts';
import { recordEvaluationReport } from './evaluation-service.ts';
import { MISSION_TEMPLATES, matchTemplateForOutcome } from './mission-templates.ts';

export interface MissionRunBinding {
  missionRunId: string;
  planRevision: number;
  contentHash: string;
  registeredAt: string;
  lastSyncedAt: string | null;
}

export interface MissionCard {
  missionId: string;
  planId: string;
  outcome: string;
  status: MissionPlan['status'];
  /** planned: validated but never started; working: bound to a runner or in flight. */
  column: 'planned' | 'working' | 'needs_you' | 'completed';
  nodeCount: number;
  activeWorkers: number;
  hosts: string[];
  boundaries: string[];
  nextDependency: string | null;
  verification: 'not_started' | 'checking' | 'passed' | 'failed';
  pendingApprovals: number;
  lastEventAt: string;
  runnerBound: boolean;
  requiresApproval: boolean;
  approved: boolean;
}

export interface MissionNodeView {
  node: MissionPlanNode;
  workItem: WorkItem | null;
  status: PlanNodeRunStatus;
  runner: RunnerMissionNode | null;
}

export interface MissionView {
  mission: Mission;
  plan: MissionPlan;
  nodes: MissionNodeView[];
  binding: MissionRunBinding | null;
  runner: RunnerMission | null;
  problems: string[];
  readyNodeIds: string[];
  card: MissionCard;
}

const BINDING_PREFIX = 'missionRun:';

function bindingKey(planId: string): string {
  return `${BINDING_PREFIX}${planId}`;
}

export async function getMissionRunBinding(planId: string): Promise<MissionRunBinding | null> {
  const record = await getDb().settings.get(bindingKey(planId));
  const value = record?.value as MissionRunBinding | undefined;
  return value && typeof value.missionRunId === 'string' ? value : null;
}

async function saveMissionRunBinding(planId: string, binding: MissionRunBinding): Promise<void> {
  await getDb().settings.put({ key: bindingKey(planId), value: binding, updatedAt: isoNow() });
}

function nodeStatuses(plan: MissionPlan, workItems: readonly WorkItem[]): Record<string, PlanNodeRunStatus> {
  const byId = new Map(workItems.map((item) => [item.id, item] as const));
  const statuses: Record<string, PlanNodeRunStatus> = {};
  for (const node of plan.nodes) {
    const workItemId = plan.nodeWorkItemIds[node.id];
    const item = workItemId ? byId.get(workItemId) : undefined;
    statuses[node.id] = item ? planNodeStatusFromWorkItem(item.status) : 'pending';
  }
  return statuses;
}

const PLANNED_STATUSES: ReadonlyArray<MissionPlan['status']> = ['draft', 'validated', 'ready'];

function columnFor(status: MissionPlan['status'], pendingApprovals: number, runnerBound: boolean): MissionCard['column'] {
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled') return 'completed';
  if (status === 'waiting_for_human' || pendingApprovals > 0) return 'needs_you';
  if (PLANNED_STATUSES.includes(status) && !runnerBound) return 'planned';
  return 'working';
}

function buildCard(mission: Mission, plan: MissionPlan, workItems: readonly WorkItem[], runner: RunnerMission | null, binding: MissionRunBinding | null): MissionCard {
  const summary = deriveMissionSummary(plan, workItems);
  const activeWorkers = summary.activeWorkers;
  const hosts = new Set<string>(summary.hosts);
  const boundaries = new Set<string>();
  if (runner) {
    for (const node of Object.values(runner.nodes)) {
      if (node.host) hosts.add(node.host.kind);
      if (node.sandbox) boundaries.add(node.sandbox.boundary);
    }
  } else {
    for (const node of plan.nodes) {
      for (const kind of node.preferredHostKinds) hosts.add(kind);
      if (node.kind !== 'human_decision') boundaries.add(hostBoundary(node.preferredHostKinds[0] ?? 'local-runner', node.sandbox));
    }
  }
  const status = summary.status;
  const verification: MissionCard['verification'] = summary.verificationStatus === 'mixed' ? 'failed' : summary.verificationStatus;
  const pendingApprovals = summary.pendingApprovals;
  return {
    missionId: mission.id,
    planId: plan.id,
    outcome: plan.outcome,
    status,
    column: columnFor(status, pendingApprovals, binding !== null),
    nodeCount: plan.nodes.length,
    activeWorkers,
    hosts: [...hosts].sort(),
    boundaries: [...boundaries].sort(),
    nextDependency: summary.nextDependency,
    verification,
    pendingApprovals,
    lastEventAt: runner?.updatedAt ?? summary.lastEventAt ?? plan.updatedAt,
    runnerBound: binding !== null,
    requiresApproval: requiresApproval(plan),
    approved: plan.approvalId !== null,
  };
}

/** Every mission in the workspace as a card, newest first. Reads only persisted state. */
export async function listMissionCards(workspaceId: string): Promise<MissionCard[]> {
  const [plans, missions, workItems] = await Promise.all([listMissionPlans(workspaceId), listMissions(workspaceId), listWorkItems(workspaceId)]);
  const missionById = new Map(missions.map((mission) => [mission.id, mission] as const));
  const cards: MissionCard[] = [];
  for (const plan of plans) {
    const mission = missionById.get(plan.missionId);
    if (!mission) continue;
    const binding = await getMissionRunBinding(plan.id);
    cards.push(buildCard(mission, plan, workItems, null, binding));
  }
  return cards.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
}

export interface CreateMissionInput {
  workspaceId: string;
  outcome: string;
  constraints?: string[];
  templateId?: string;
  repositoryRoot?: string | null;
  /** Who is creating the mission; recorded on its ledger events. Defaults to the person. */
  actorType?: MissionCreatorType;
}

/** Outcome in, validated plan out. Template selection is deterministic and reported. */
export async function createMission(input: CreateMissionInput): Promise<Result<{ mission: Mission; plan: MissionPlan; templateId: string }>> {
  const outcome = input.outcome.trim();
  if (outcome.length < 8) return fail('validation', 'Describe the result in at least a short sentence.');
  if (outcome.length > 2000) return fail('validation', 'Keep the outcome under 2,000 characters.');
  const templateId = input.templateId ?? matchTemplateForOutcome(outcome);
  if (!MISSION_TEMPLATES.some((template) => template.id === templateId)) return fail('validation', `Unknown template ${templateId}.`);
  const created = await createOutcomeMission({
    workspaceId: input.workspaceId,
    outcome,
    constraints: input.constraints ?? [],
    templateId,
    repositoryRoot: input.repositoryRoot ?? null,
    actorType: input.actorType ?? 'human',
  });
  if (!created.ok) return created;
  return ok({ ...created.value, templateId });
}

/** The full view of one mission: plan, node states, runner mirror, validation problems. */
export async function getMissionView(workspaceId: string, missionId: string): Promise<Result<MissionView>> {
  const mission = await getMission(missionId);
  if (!mission || mission.workspaceId !== workspaceId) return fail('not_found', 'Mission not found in this space.');
  const plan = await getPlanForMission(workspaceId, missionId);
  if (!plan) return fail('not_found', 'This mission has no plan yet.');
  const workItems = await listWorkItems(workspaceId);
  const binding = await getMissionRunBinding(plan.id);
  let runner: RunnerMission | null = null;
  if (binding) {
    const fetched = await getRunnerMission(binding.missionRunId);
    runner = fetched.ok ? fetched.value : null;
  }
  const statuses = nodeStatuses(plan, workItems);
  const byId = new Map(workItems.map((item) => [item.id, item] as const));
  const nodes: MissionNodeView[] = plan.nodes.map((node) => ({
    node,
    workItem: byId.get(plan.nodeWorkItemIds[node.id] ?? '') ?? null,
    status: statuses[node.id] ?? 'pending',
    runner: runner?.nodes[node.id] ?? null,
  }));
  return ok({
    mission,
    plan,
    nodes,
    binding,
    runner,
    problems: validateMissionPlan(plan).map((problem) => problem.message),
    readyNodeIds: computeReadyNodeIds(plan, statuses),
    card: buildCard(mission, plan, workItems, runner, binding),
  });
}

/** Human approval of the exact plan revision. Agents receive approval_required. */
export async function approveMissionPlan(workspaceId: string, planId: string, expectedRevision: number, actorType: ActorType = 'human'): Promise<Result<MissionPlan>> {
  return approvePlan(workspaceId, planId, expectedRevision, actorType);
}

/** The runner reports free-form probe details; the registry wants one string. */
function probeDetailText(details: unknown): string {
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) return details.map(String).join('; ');
  if (details && typeof details === 'object') return Object.entries(details as Record<string, unknown>).map(([key, value]) => `${key}=${String(value)}`).join('; ');
  return '';
}

function toRegistryProbe(probe: RunnerHostProbe): Parameters<typeof probeToExecutionHost>[0] {
  return { ...probe, details: probeDetailText(probe.details) };
}

async function currentHosts(workspaceId: string): Promise<Result<{ hosts: ExecutionHost[]; probes: RunnerHostProbe[] }>> {
  const status = await runnerStatus();
  if (!status.reachable) return fail('temporary', 'No runner is listening on 127.0.0.1:47821. Start it with: node runner/server.mjs');
  if (!status.paired) return fail('approval_required', 'Pair the local runner in Connections before starting a mission.');
  const probed = await listRunnerHosts();
  if (!probed.ok) return probed;
  return ok({ hosts: probed.value.hosts.map((probe) => probeToExecutionHost(toRegistryProbe(probe), workspaceId)), probes: probed.value.hosts });
}

/**
 * Start a mission on the paired runner: refuses stale hashes and missing
 * approvals, projects the graph into work items once, builds hashed envelopes,
 * registers and starts the runner mission, and records the binding.
 */
export async function startMission(workspaceId: string, missionId: string, expectedRevision: number): Promise<Result<MissionView>> {
  const view = await getMissionView(workspaceId, missionId);
  if (!view.ok) return view;
  let { plan } = view.value;
  if (plan.revision !== expectedRevision) return fail('conflict', `The plan is at revision ${plan.revision}, not ${expectedRevision}. Re-read it before starting.`);
  if (plan.status !== 'draft' && plan.status !== 'validated' && plan.status !== 'ready' && plan.status !== 'failed') {
    return fail('conflict', `The mission is ${plan.status}; it cannot be started again from here.`);
  }
  const problems = validateMissionPlan(plan);
  if (problems.length > 0) return fail('validation', `The plan is not valid: ${problems.map((problem) => problem.message).join('; ')}`);
  const recomputed = await computePlanContentHash(plan);
  if (recomputed !== plan.contentHash) return fail('conflict', 'The plan hash is stale. Revise the plan so the hash matches before starting.');
  if (requiresApproval(plan) && !plan.approvalId) {
    return fail('approval_required', 'This plan includes consequential work. A person must approve this exact revision before it starts.');
  }
  const hosts = await currentHosts(workspaceId);
  if (!hosts.ok) return hosts;
  const usable = hosts.value.hosts.filter((host) => host.status === 'available');
  if (usable.length === 0) return fail('temporary', 'The runner reports no available agent host. Install or sign into Codex or Claude Code, or start the runner with --allow-mock-host for a rehearsal.');

  if (Object.keys(plan.nodeWorkItemIds).length === 0) {
    const projected = await projectPlanToWorkItems(workspaceId, plan.id);
    if (!projected.ok) return projected;
    plan = projected.value;
  }
  const envelopes = await buildNodeEnvelopes(workspaceId, plan.id, usable);
  if (!envelopes.ok) return envelopes;

  const existing = await getMissionRunBinding(plan.id);
  let missionRunId = existing && existing.planRevision === plan.revision && existing.contentHash === plan.contentHash ? existing.missionRunId : null;
  if (!missionRunId) {
    const submitted = await submitRunnerMission({ plan: plan as unknown as Record<string, unknown>, envelopes: envelopes.value as unknown as Record<string, Record<string, unknown>> });
    if (!submitted.ok) return submitted;
    missionRunId = submitted.value.missionRunId;
    await saveMissionRunBinding(plan.id, { missionRunId, planRevision: plan.revision, contentHash: plan.contentHash, registeredAt: isoNow(), lastSyncedAt: null });
  }
  const started = await startRunnerMission(missionRunId);
  if (!started.ok) return started;
  const recorded = await recordPlanStatus(workspaceId, plan.id, 'running', `started on the paired runner as ${missionRunId}`);
  if (!recorded.ok) return recorded;
  return syncMission(workspaceId, missionId);
}

function runnerEventFor(node: RunnerMissionNode, report: EvaluationReport | null, maxAttempts: number): RunnerNodeEvent | null {
  switch (node.status) {
    case 'running': return { type: 'started', hostId: node.host?.hostId ?? null };
    case 'verifying': return { type: 'completed' };
    case 'waiting_for_human': return { type: 'needs_human' };
    case 'succeeded': return { type: 'verified', report };
    // The runner retries inside its own node (status goes back to running); a reported
    // "failed" is final, including a failure before any attempt ran, so it never becomes RETRYING here.
    case 'failed': return { type: 'verification_failed', attempt: Math.max(node.attempts, maxAttempts), report };
    case 'blocked': return { type: 'blocked', reason: node.lastError ?? undefined };
    case 'cancelled': return { type: 'cancelled' };
    default: return null;
  }
}

/**
 * Mirror the runner's node states onto the work items through legal
 * transitions only, record evaluation reports, and derive the plan status.
 * Safe to call repeatedly; nothing is applied twice.
 */
export async function syncMission(workspaceId: string, missionId: string): Promise<Result<MissionView>> {
  const view = await getMissionView(workspaceId, missionId);
  if (!view.ok) return view;
  const { plan, binding, runner } = view.value;
  if (!binding || !runner) return view;

  for (const node of plan.nodes) {
    const runnerNode = runner.nodes[node.id];
    const workItemId = plan.nodeWorkItemIds[node.id];
    if (!runnerNode || !workItemId) continue;
    const item = await getWorkItem(workspaceId, workItemId);
    if (!item) continue;
    let report: EvaluationReport | null = null;
    if (runnerNode.evaluation && (runnerNode.status === 'succeeded' || runnerNode.status === 'failed') && planNodeStatusFromWorkItem(item.status) !== runnerNode.status) {
      const recordedReport = await recordEvaluationReport({
        workspaceId,
        missionId,
        workItemId,
        workerRunId: runnerNode.jobIds[runnerNode.jobIds.length - 1] ?? binding.missionRunId,
        checks: runnerNode.evaluation.checks.map((check) => {
          const spec = node.verificationPlan.find((candidate) => candidate.id === check.id);
          return {
            id: check.id,
            kind: spec?.kind ?? 'file',
            required: spec?.required ?? true,
            status: (['passed', 'failed', 'blocked', 'not_run'].includes(check.status) ? check.status : 'not_run') as 'passed' | 'failed' | 'blocked' | 'not_run',
            detail: `${check.name}: ${check.detail}`.slice(0, 500),
          };
        }),
        status: runnerNode.evaluation.status,
      });
      if (!recordedReport.ok) return recordedReport;
      report = recordedReport.value;
    }
    const event = runnerEventFor(runnerNode, report, node.maxAttempts);
    if (!event) continue;
    const applied = applyRunnerNodeEvent(plan, item, event);
    for (const target of applied.transitions) {
      const moved = await transitionWorkItem(workspaceId, workItemId, target, { actorType: 'system', reason: `runner reported ${runnerNode.status}` });
      if (!moved.ok) return moved;
    }
  }

  await saveMissionRunBinding(plan.id, { ...binding, lastSyncedAt: isoNow() });
  const refreshed = await getMissionView(workspaceId, missionId);
  if (!refreshed.ok) return refreshed;
  if (refreshed.value.card.status !== plan.status) {
    const recorded = await recordPlanStatus(workspaceId, plan.id, refreshed.value.card.status, 'derived from runner state');
    if (!recorded.ok) return recorded;
  }
  return getMissionView(workspaceId, missionId);
}

/** Cancel on the runner first, then mirror locally. */
export async function cancelMission(workspaceId: string, missionId: string, actorType: ActorType = 'human'): Promise<Result<MissionView>> {
  const view = await getMissionView(workspaceId, missionId);
  if (!view.ok) return view;
  const { plan, binding } = view.value;
  if (plan.status === 'succeeded' || plan.status === 'cancelled') return fail('conflict', `The mission is already ${plan.status}.`);
  if (binding) {
    const cancelled = await cancelRunnerMission(binding.missionRunId);
    if (!cancelled.ok && cancelled.error.code !== 'not_found') return cancelled;
  }
  for (const node of plan.nodes) {
    const workItemId = plan.nodeWorkItemIds[node.id];
    if (!workItemId) continue;
    const item = await getWorkItem(workspaceId, workItemId);
    if (!item || item.status === 'SUCCEEDED' || item.status === 'CANCELLED' || item.status === 'VERIFYING') continue;
    const moved = await transitionWorkItem(workspaceId, workItemId, 'CANCELLED', { actorType: actorType === 'runner' ? 'system' : actorType, reason: 'mission cancelled' });
    if (!moved.ok) return moved;
  }
  const cancelledBy = actorType === 'agent' ? 'cancelled by the agent' : actorType === 'human' ? 'cancelled by the person' : `cancelled by the ${actorType}`;
  const recorded = await recordPlanStatus(workspaceId, plan.id, 'cancelled', cancelledBy);
  if (!recorded.ok) return recorded;
  return getMissionView(workspaceId, missionId);
}

/** A person decides a human_decision node. The approval record must exist first. */
export async function decideMissionNode(
  workspaceId: string,
  missionId: string,
  nodeId: string,
  decision: 'approved' | 'rejected',
  approvalId: string | null,
  actorType: ActorType = 'human',
): Promise<Result<MissionView>> {
  if (actorType !== 'human') return fail('approval_required', 'Only a person may decide a mission node.');
  const view = await getMissionView(workspaceId, missionId);
  if (!view.ok) return view;
  const { plan, binding } = view.value;
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.kind !== 'human_decision') return fail('validation', 'That node does not need a decision.');
  const approval = approvalId ? await getDb().approvals.get(approvalId) : undefined;
  if (decision === 'approved' && (!approval || approval.workspaceId !== workspaceId || approval.decision !== 'approved' || approval.contentHash !== plan.contentHash)) {
    return fail('approval_required', 'The approval does not bind this exact plan revision.');
  }
  if (binding) {
    const decided = await decideRunnerMission(binding.missionRunId, { nodeId, decision, approvalId: approvalId ?? '', contentHash: plan.contentHash });
    if (!decided.ok) return decided;
  }
  const workItemId = plan.nodeWorkItemIds[nodeId];
  if (workItemId) {
    const item = await getWorkItem(workspaceId, workItemId);
    if (item?.status === 'WAITING_FOR_HUMAN') {
      const moved = await transitionWorkItem(workspaceId, workItemId, decision === 'approved' ? 'QUEUED' : 'CANCELLED', { actorType: 'human', reason: `decision ${decision}` });
      if (!moved.ok) return moved;
    }
  }
  return syncMission(workspaceId, missionId);
}

/** Park a node for a person with a question. Never approves anything. */
export async function requestMissionAction(workspaceId: string, missionId: string, nodeId: string, question: string, actorType: ActorType = 'agent'): Promise<Result<{ parked: boolean; workItemId: string | null }>> {
  const trimmed = question.trim();
  if (trimmed.length === 0) return fail('validation', 'Say what decision you need.');
  const plan = await getPlanForMission(workspaceId, missionId);
  if (!plan) return fail('not_found', 'This mission has no plan.');
  if (!plan.nodes.some((node) => node.id === nodeId)) {
    return fail('validation', `Unknown node "${nodeId}". Valid node ids: ${plan.nodes.map((node) => node.id).join(', ')}.`, { nodeIds: plan.nodes.map((node) => node.id) });
  }
  const workItemId = plan.nodeWorkItemIds[nodeId] ?? null;
  if (!workItemId) return fail('validation', 'That node has not been projected into work yet; start the mission first.');
  const item = await getWorkItem(workspaceId, workItemId);
  if (!item) return fail('not_found', 'Work item not found.');
  let parked = false;
  if (item.status === 'RUNNING') {
    const moved = await transitionWorkItem(workspaceId, workItemId, 'WAITING_FOR_HUMAN', { actorType: actorType === 'runner' ? 'system' : actorType, reason: trimmed.slice(0, 200) });
    parked = moved.ok;
  }
  return ok({ parked, workItemId });
}

export async function missionPlanForTool(workspaceId: string, missionId: string | null): Promise<Result<MissionView>> {
  const target = missionId ?? (await listMissionPlans(workspaceId))[0]?.missionId ?? null;
  if (!target) return fail('not_found', 'No mission exists in this space yet. Create one with an outcome first.');
  return getMissionView(workspaceId, target);
}

export { getMissionPlan };
