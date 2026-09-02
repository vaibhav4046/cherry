/**
 * Mission plan persistence: outcome missions, plan revisions, human approval,
 * projection into work items and the envelopes the runner consumes. Every
 * mutation runs in withWorkspaceTx so its ProofEvent lands in the same
 * IndexedDB transaction; hashing happens before the transaction. Agents never
 * approve here. Executables in an envelope come only from host kinds.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import { sha256Canonical } from '../core/hash.ts';
import { canonicalize } from '../core/canonical-json.ts';
import type { ActorType } from '../core/domain-event.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';
import { createMission } from '../mission/mission-service.ts';
import type { Mission, RiskLevel } from '../mission/mission-model.ts';
import { createWorkItem } from './workforce-service.ts';
import {
  canTransition,
  type ExecutionEnvelope,
  type ExecutionHost,
  type ExecutionHostKind,
  type RuntimeCapability,
  type WorkItem,
} from './workforce-model.ts';
import {
  MISSION_PLAN_STATUSES,
  computePlanContentHash,
  planNodeOutputs,
  planTopologicalOrder,
  repositoryRootFromNode,
  requiresApproval,
  validateMissionPlan,
  type MissionPlan,
  type MissionPlanNode,
  type MissionPlanStatus,
  type PlanRisk,
} from './mission-plan-model.ts';
import { instantiateTemplate, isMissionTemplateId, matchTemplateForOutcome } from './mission-templates.ts';
import { rankHosts } from './host-registry-service.ts';

export { requiresApproval };

const MAX_OUTCOME_LENGTH = 4000;
const MAX_CONTEXT_TEXT_CHARS = 20_000;
/** Canonical order of the executables an envelope may ever name. */
const EXECUTABLE_ORDER = ['codex', 'claude', 'node'] as const;
const HOST_KIND_EXECUTABLE: Partial<Record<ExecutionHostKind, (typeof EXECUTABLE_ORDER)[number]>> = {
  'codex-cli': 'codex',
  'claude-cli': 'claude',
};
const SIDE_EFFECT_CAPABILITIES: readonly RuntimeCapability[] = ['repository_write', 'command_execution', 'artifact_write', 'network', 'browser_control'];

function workItemRisk(risk: PlanRisk): RiskLevel {
  return risk === 'critical' ? 'high' : risk;
}

function planRisk(plan: MissionPlan): RiskLevel {
  const order: PlanRisk[] = ['low', 'medium', 'high', 'critical'];
  const highest = plan.nodes.reduce((max, node) => Math.max(max, order.indexOf(node.riskLevel)), 0);
  return workItemRisk(order[highest] ?? 'low');
}

// ---------------- Reads ----------------

export async function getMissionPlan(workspaceId: string, planId: string): Promise<MissionPlan | null> {
  const plan = await getDb().missionPlans.get(planId);
  return plan && plan.workspaceId === workspaceId ? plan : null;
}

export async function listMissionPlans(workspaceId: string): Promise<MissionPlan[]> {
  const plans = await getDb().missionPlans.where('workspaceId').equals(workspaceId).toArray();
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlanForMission(workspaceId: string, missionId: string): Promise<MissionPlan | null> {
  const plans = await getDb().missionPlans.where('missionId').equals(missionId).toArray();
  const mine = plans.filter((plan) => plan.workspaceId === workspaceId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return mine[0] ?? null;
}

// ---------------- Create ----------------

export interface CreateOutcomeMissionInput {
  workspaceId: string;
  outcome: string;
  constraints?: string[];
  templateId?: string;
  repositoryRoot?: string | null;
}

export async function createOutcomeMission(input: CreateOutcomeMissionInput): Promise<Result<{ mission: Mission; plan: MissionPlan }>> {
  const outcome = input.outcome.trim();
  if (outcome.length === 0) return err('validation', 'Tell Cherry the outcome you want.');
  if (outcome.length > MAX_OUTCOME_LENGTH) return err('validation', `The outcome must be at most ${MAX_OUTCOME_LENGTH} characters.`);
  const templateId = input.templateId ?? matchTemplateForOutcome(outcome);
  if (!isMissionTemplateId(templateId)) return err('validation', `Unknown mission template "${templateId}".`);
  const constraints = (input.constraints ?? []).map((line) => line.trim()).filter(Boolean);
  const repositoryRoot = input.repositoryRoot?.trim() ? input.repositoryRoot.trim() : null;

  const draft = instantiateTemplate(templateId, { workspaceId: input.workspaceId, missionId: 'pending', outcome, constraints, repositoryRoot });
  const created = await createMission({
    workspaceId: input.workspaceId,
    title: outcome.slice(0, 160),
    objective: outcome,
    definitionOfDone: ['Every plan node passed its independent verification', 'Every human decision in the plan was recorded'],
    constraints,
    agentRole: 'Cherry mission team',
    riskLevel: planRisk(draft),
  });
  if (!created.ok) return created;
  const mission = created.value;

  const plan: MissionPlan = {
    ...draft,
    missionId: mission.id,
    nodes: draft.nodes.map((node) => ({ ...node, missionId: mission.id })),
    status: 'validated',
  };
  const problems = validateMissionPlan(plan);
  if (problems.length > 0) return err('validation', 'The mission template produced an invalid plan.', { problems });
  plan.contentHash = await computePlanContentHash(plan);

  await withWorkspaceTx(input.workspaceId, ['missionPlans'], async (ctx) => {
    await ctx.db.missionPlans.add(plan);
    ctx.emit({
      type: 'mission.plan_created',
      actorType: 'human',
      objectType: 'mission_plan',
      objectId: plan.id,
      summary: `Mission plan created from "${templateId}" with ${plan.nodes.length} nodes (r${plan.revision})`,
      payload: { missionId: mission.id, templateId, revision: plan.revision, contentHash: plan.contentHash, nodeCount: plan.nodes.length },
    });
  });
  return ok({ mission, plan });
}

// ---------------- Revise ----------------

export type PlanPatch = Partial<Pick<MissionPlan, 'outcome' | 'constraints' | 'nodes' | 'templateId'>>;

export async function revisePlan(workspaceId: string, planId: string, patch: PlanPatch, expectedRevision: number): Promise<Result<MissionPlan>> {
  const current = await getMissionPlan(workspaceId, planId);
  if (!current) return err('not_found', 'Mission plan not found.');
  if (current.revision !== expectedRevision) {
    return err('conflict', `Mission plan is at revision ${current.revision}, not ${expectedRevision}. Re-read before editing.`);
  }
  if (current.status !== 'draft' && current.status !== 'validated') {
    return err('conflict', 'The plan has started. Cancel it and create a new mission to change the graph.');
  }
  if (Object.keys(current.nodeWorkItemIds).length > 0) {
    return err('conflict', 'The plan is already projected into work items. Create a new mission to change the graph.');
  }
  const now = isoNow();
  const next: MissionPlan = {
    ...current,
    ...(patch.outcome !== undefined ? { outcome: patch.outcome.trim() } : {}),
    ...(patch.constraints !== undefined ? { constraints: patch.constraints.map((line) => line.trim()).filter(Boolean) } : {}),
    ...(patch.templateId !== undefined ? { templateId: patch.templateId } : {}),
    ...(patch.nodes !== undefined ? { nodes: patch.nodes.map((node) => ({ ...node, missionId: current.missionId })) } : {}),
    status: 'validated',
    revision: current.revision + 1,
    approvalId: null,
    updatedAt: now,
  };
  const problems = validateMissionPlan(next);
  if (problems.length > 0) return err('validation', 'The revised plan is not valid.', { problems });
  next.contentHash = await computePlanContentHash(next);

  return withWorkspaceTx(workspaceId, ['missionPlans'], async (ctx) => {
    const stored = await ctx.db.missionPlans.get(planId);
    if (!stored || stored.workspaceId !== workspaceId) return err('not_found', 'Mission plan not found.');
    if (stored.revision !== expectedRevision) return err('conflict', `Mission plan changed to revision ${stored.revision} while revising r${expectedRevision}.`);
    await ctx.db.missionPlans.put(next);
    ctx.emit({
      type: 'mission.plan_revised',
      actorType: 'human',
      objectType: 'mission_plan',
      objectId: planId,
      summary: `Mission plan revised r${current.revision} to r${next.revision}; approval cleared`,
      payload: { fromRevision: current.revision, toRevision: next.revision, contentHash: next.contentHash, fields: Object.keys(patch) },
    });
    return ok(next);
  });
}

// ---------------- Approve (human only) ----------------

export async function approvePlan(workspaceId: string, planId: string, expectedRevision: number, actorType: ActorType = 'human'): Promise<Result<MissionPlan>> {
  if (actorType !== 'human') return err('approval_required', 'Only a person may approve a mission plan.');
  const current = await getMissionPlan(workspaceId, planId);
  if (!current) return err('not_found', 'Mission plan not found.');
  if (current.revision !== expectedRevision) {
    return err('conflict', `Mission plan is at revision ${current.revision}, not ${expectedRevision}. Re-read before approving.`);
  }
  const problems = validateMissionPlan(current);
  if (problems.length > 0) return err('validation', 'The plan is not valid and cannot be approved.', { problems });
  // Hashing is async non-Dexie work, so it happens before the transaction.
  const contentHash = await computePlanContentHash(current);
  if (contentHash !== current.contentHash) return err('conflict', 'The stored plan hash does not match its content. Revise the plan before approving.');

  return withWorkspaceTx(workspaceId, ['missionPlans', 'approvals'], async (ctx) => {
    const plan = await ctx.db.missionPlans.get(planId);
    if (!plan || plan.workspaceId !== workspaceId) return err('not_found', 'Mission plan not found.');
    if (plan.revision !== expectedRevision || plan.contentHash !== contentHash) {
      return err('conflict', `Mission plan changed while approving r${expectedRevision}.`);
    }
    const now = isoNow();
    const approval: ApprovalRecord = {
      id: newId('ap'),
      workspaceId,
      objectType: 'mission_plan',
      objectId: planId,
      objectRevision: plan.revision,
      decision: 'approved',
      requestedAt: now,
      requestedBy: 'user',
      requestReason: `Approve mission plan r${plan.revision} (${plan.nodes.length} nodes)`,
      decidedBy: 'user',
      decidedAt: now,
      contentHash,
    };
    const updated: MissionPlan = { ...plan, approvalId: approval.id, updatedAt: now };
    await ctx.db.approvals.add(approval);
    await ctx.db.missionPlans.put(updated);
    ctx.emit({
      type: 'mission.plan_approved',
      actorType: 'human',
      objectType: 'mission_plan',
      objectId: planId,
      summary: `Mission plan r${plan.revision} approved by a person`,
      payload: { revision: plan.revision, contentHash, approvalId: approval.id },
    });
    return ok(updated);
  });
}

// ---------------- Project into work items ----------------

/**
 * One WorkItem per node, READY, with dependencies mapped through the plan.
 * Idempotent: nodes that already have a live work item are updated, not
 * duplicated, so an imported plan can be projected again.
 */
export async function projectPlanToWorkItems(workspaceId: string, planId: string): Promise<Result<MissionPlan>> {
  const plan = await getMissionPlan(workspaceId, planId);
  if (!plan) return err('not_found', 'Mission plan not found.');
  const problems = validateMissionPlan(plan);
  if (problems.length > 0) return err('validation', 'The plan is not valid and cannot be projected.', { problems });
  if (plan.status !== 'draft' && plan.status !== 'validated' && plan.status !== 'ready') {
    return err('conflict', 'The plan has started; its work items already exist.');
  }

  const order = planTopologicalOrder(plan);
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));
  const nodeWorkItemIds: Record<string, string> = {};
  let created = 0;
  for (const nodeId of order) {
    const node = nodeById.get(nodeId)!;
    const existingId = plan.nodeWorkItemIds[nodeId];
    const existing = existingId ? await getDb().workItems.get(existingId) : undefined;
    if (existing && existing.workspaceId === workspaceId) {
      nodeWorkItemIds[nodeId] = existing.id;
      continue;
    }
    const item = await createWorkItem({
      workspaceId,
      title: node.title,
      objective: node.objective,
      definitionOfDone: node.definitionOfDone,
      riskLevel: workItemRisk(node.riskLevel),
      contextRefs: node.contextRefs,
    });
    if (!item.ok) return item;
    nodeWorkItemIds[nodeId] = item.value.id;
    created += 1;
  }

  return withWorkspaceTx(workspaceId, ['workItems', 'missionPlans'], async (ctx) => {
    const stored = await ctx.db.missionPlans.get(planId);
    if (!stored || stored.workspaceId !== workspaceId) return err('not_found', 'Mission plan not found.');
    if (stored.revision !== plan.revision) return err('conflict', 'Mission plan changed while projecting it.');
    let transitioned = 0;
    for (const nodeId of order) {
      const node = nodeById.get(nodeId)!;
      const item = await ctx.db.workItems.get(nodeWorkItemIds[nodeId]!);
      if (!item || item.workspaceId !== workspaceId) return err('not_found', `Work item for node "${nodeId}" not found.`);
      const dependencyIds = node.dependencyIds.map((dependency) => nodeWorkItemIds[dependency]!);
      const wantsReady = item.status === 'DRAFT' && canTransition(item.status, 'READY');
      const unchanged = item.missionId === plan.missionId
        && !wantsReady
        && JSON.stringify(item.dependencyIds) === JSON.stringify(dependencyIds)
        && JSON.stringify(item.requiredCapabilities) === JSON.stringify(node.requiredCapabilities)
        && item.riskLevel === workItemRisk(node.riskLevel);
      if (unchanged) continue;
      const next: WorkItem = {
        ...item,
        missionId: plan.missionId,
        dependencyIds,
        requiredCapabilities: [...node.requiredCapabilities],
        riskLevel: workItemRisk(node.riskLevel),
        status: wantsReady ? 'READY' : item.status,
        revision: item.revision + 1,
        updatedAt: isoNow(),
      };
      await ctx.db.workItems.put(next);
      if (wantsReady) {
        transitioned += 1;
        ctx.emit({
          type: 'work.item_transitioned',
          actorType: 'system',
          objectType: 'workItem',
          objectId: item.id,
          summary: `Work item "${item.title}": DRAFT → READY (projected from plan node ${nodeId})`,
          payload: { planId, nodeId, dependencyIds },
        });
      }
    }
    const status: MissionPlanStatus = 'ready';
    const updated: MissionPlan = { ...stored, nodeWorkItemIds, status, updatedAt: isoNow() };
    await ctx.db.missionPlans.put(updated);
    if (created > 0 || transitioned > 0 || stored.status !== 'ready') {
      ctx.emit({
        type: 'mission.plan_status',
        actorType: 'system',
        objectType: 'mission_plan',
        objectId: planId,
        summary: `Mission plan projected into ${order.length} work items (${created} created, ${transitioned} made ready)`,
        payload: { from: stored.status, to: status, created, transitioned, nodeCount: order.length },
      });
    }
    return ok(updated);
  });
}

// ---------------- Envelopes ----------------

function executablesForKinds(kinds: readonly ExecutionHostKind[]): string[] {
  const wanted = new Set(kinds.map((kind) => HOST_KIND_EXECUTABLE[kind]).filter((executable): executable is (typeof EXECUTABLE_ORDER)[number] => executable !== undefined));
  return EXECUTABLE_ORDER.filter((executable) => wanted.has(executable));
}

export interface NodeEnvelopeOptions {
  /** Compiled context per node id; written by the runner to .cherry/CONTEXT.md. */
  contexts?: Record<string, { id: string; text: string }>;
  /** Overrides the repository root recorded on the nodes. */
  sourceRoot?: string | null;
  baseRef?: string | null;
}

async function buildEnvelope(plan: MissionPlan, node: MissionPlanNode, workItem: WorkItem, hosts: readonly ExecutionHost[], options: NodeEnvelopeOptions): Promise<ExecutionEnvelope> {
  const rankedKinds = [...new Set(rankHosts(hosts, node).map((host) => host.kind))];
  const hostKinds = node.preferredHostKinds.length > 0 ? [...node.preferredHostKinds] : rankedKinds;
  const allowedExecutables = node.kind === 'verify' ? ['node'] : executablesForKinds(hostKinds);
  const sourceRoot = options.sourceRoot !== undefined ? options.sourceRoot : repositoryRootFromNode(node);
  const context = options.contexts?.[node.id] ?? null;
  const boundedPrompt = JSON.stringify({
    planId: plan.id,
    planRevision: plan.revision,
    planContentHash: plan.contentHash,
    nodeId: node.id,
    kind: node.kind,
    title: node.title,
    objective: node.objective,
    definitionOfDone: node.definitionOfDone,
    contextBundleId: context?.id ?? null,
    contextText: (context?.text ?? '').slice(0, MAX_CONTEXT_TEXT_CHARS),
    sandbox: { provider: node.sandbox, sourceRoot, ...(options.baseRef ? { baseRef: options.baseRef } : {}) },
    hostKinds,
    outputs: planNodeOutputs(node),
  });
  const envelope: Omit<ExecutionEnvelope, 'actionHash'> = {
    schemaVersion: 1,
    workspaceId: plan.workspaceId,
    workItemId: workItem.id,
    workItemRevision: workItem.revision,
    routineId: null,
    routineRevision: null,
    executionHostId: node.preferredHostKinds[0] ?? 'any',
    adapter: node.kind === 'verify' ? 'cherry-check' : 'agent-host',
    workingDirectory: null,
    boundedPrompt,
    contextRefs: [...node.contextRefs],
    requiredCapabilities: [...node.requiredCapabilities],
    allowedExecutables,
    allowedOrigins: [],
    sideEffects: node.requiredCapabilities.filter((capability) => SIDE_EFFECT_CAPABILITIES.includes(capability)),
    dataEgress: node.requiredCapabilities.includes('network') ? ['network'] : [],
    verificationPlan: node.verificationPlan.map((check) => canonicalize(check)),
    idempotencyKey: `${plan.missionId}@r${plan.revision}@${node.id}`,
    approvalIntentId: plan.approvalId,
    createdAt: isoNow(),
  };
  return { ...envelope, actionHash: await sha256Canonical(envelope) };
}

/** One envelope per agent or verify node; human decisions never get one. */
export async function buildNodeEnvelopes(
  workspaceId: string,
  planId: string,
  hosts: readonly ExecutionHost[],
  options: NodeEnvelopeOptions = {},
): Promise<Result<Record<string, ExecutionEnvelope>>> {
  const plan = await getMissionPlan(workspaceId, planId);
  if (!plan) return err('not_found', 'Mission plan not found.');
  const problems = validateMissionPlan(plan);
  if (problems.length > 0) return err('validation', 'The plan is not valid.', { problems });
  const envelopes: Record<string, ExecutionEnvelope> = {};
  for (const node of plan.nodes) {
    if (node.kind === 'human_decision') continue;
    const workItemId = plan.nodeWorkItemIds[node.id];
    const workItem = workItemId ? await getDb().workItems.get(workItemId) : undefined;
    if (!workItem || workItem.workspaceId !== workspaceId) {
      return err('conflict', `Project the plan into work items before building envelopes (node "${node.id}" has none).`);
    }
    envelopes[node.id] = await buildEnvelope(plan, node, workItem, hosts, options);
  }
  return ok(envelopes);
}

// ---------------- Status ----------------

export async function recordPlanStatus(workspaceId: string, planId: string, status: MissionPlanStatus, reason?: string): Promise<Result<MissionPlan>> {
  if (!MISSION_PLAN_STATUSES.includes(status)) return err('validation', `Unknown plan status "${String(status)}".`);
  return withWorkspaceTx(workspaceId, ['missionPlans'], async (ctx) => {
    const plan = await ctx.db.missionPlans.get(planId);
    if (!plan || plan.workspaceId !== workspaceId) return err('not_found', 'Mission plan not found.');
    if (plan.status === status) return ok(plan);
    const updated: MissionPlan = { ...plan, status, updatedAt: isoNow() };
    await ctx.db.missionPlans.put(updated);
    ctx.emit({
      type: status === 'running' ? 'mission.plan_started' : 'mission.plan_status',
      actorType: 'system',
      objectType: 'mission_plan',
      objectId: planId,
      summary: `Mission plan ${plan.status} → ${status}${reason ? ` (${reason})` : ''}`,
      payload: { from: plan.status, to: status, reason: reason ?? null },
    });
    return ok(updated);
  });
}
