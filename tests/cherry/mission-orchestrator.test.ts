import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { canTransition, type WorkItem, type WorkItemStatus } from '../../src/cherry/workforce/workforce-model.ts';
import { getWorkItem, transitionWorkItem } from '../../src/cherry/workforce/workforce-service.ts';
import {
  computeEvaluationReportHash,
  type EvaluationReport,
  type MissionPlan,
  type MissionPlanNode,
} from '../../src/cherry/workforce/mission-plan-model.ts';
import { createOutcomeMission, projectPlanToWorkItems, revisePlan } from '../../src/cherry/workforce/mission-plan-service.ts';
import { applyRunnerNodeEvent, deriveMissionSummary, type RunnerNodeEvent } from '../../src/cherry/workforce/mission-orchestrator.ts';
import { instantiateTemplate } from '../../src/cherry/workforce/mission-templates.ts';

const NOW = '2026-09-02T12:00:00.000Z';

function samplePlan(): MissionPlan {
  const plan = instantiateTemplate('release-mission', { workspaceId: 'ws-1', missionId: 'ms-1', outcome: 'Ship it', constraints: [], repositoryRoot: null });
  return { ...plan, nodeWorkItemIds: Object.fromEntries(plan.nodes.map((node) => [node.id, `wk-${node.id}`])) };
}

function workItemFor(plan: MissionPlan, node: MissionPlanNode, status: WorkItemStatus, extra: Partial<WorkItem> = {}): WorkItem {
  return {
    id: `wk-${node.id}`,
    workspaceId: plan.workspaceId,
    missionId: plan.missionId,
    parentWorkItemId: null,
    title: node.title,
    objective: node.objective,
    definitionOfDone: node.definitionOfDone,
    priority: 'normal',
    riskLevel: 'low',
    status,
    assignedAgentIds: [],
    crewId: null,
    dependencyIds: node.dependencyIds.map((id) => `wk-${id}`),
    requiredCapabilities: node.requiredCapabilities,
    executionHostId: null,
    routineId: null,
    currentRunId: null,
    contextRefs: [],
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

async function reportFor(plan: MissionPlan, node: MissionPlanNode, workItemId: string, status: EvaluationReport['status']): Promise<EvaluationReport> {
  const report: EvaluationReport = {
    id: 'er-1',
    workspaceId: plan.workspaceId,
    missionId: plan.missionId,
    workItemId,
    nodeId: node.id,
    planRevision: plan.revision,
    attempt: 1,
    status,
    checks: node.verificationPlan.map((check) => ({ id: check.id, kind: check.kind, required: check.required, status: status === 'passed' ? 'passed' : 'failed', detail: 'fixture' })),
    summary: `${status} for ${node.id}`,
    evaluatorKind: 'cherry-check',
    contentHash: '',
    createdAt: NOW,
  };
  report.contentHash = await computeEvaluationReportHash(report);
  return report;
}

function walk(from: WorkItemStatus, transitions: WorkItemStatus[]): WorkItemStatus {
  let current = from;
  for (const next of transitions) {
    expect(canTransition(current, next), `${current} -> ${next}`).toBe(true);
    current = next;
  }
  return current;
}

describe('applyRunnerNodeEvent', () => {
  const plan = samplePlan();
  const node = plan.nodes.find((candidate) => candidate.id === 'developer-fix')!;

  it('walks READY through the queue into RUNNING when the runner starts a node', () => {
    const outcome = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'READY'), { type: 'started', hostId: 'ho-codex' });
    expect(outcome.refused).toBeNull();
    expect(walk('READY', outcome.transitions)).toBe('RUNNING');
    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'started' }).transitions).toEqual([]);
    expect(walk('RETRYING', applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RETRYING'), { type: 'started' }).transitions)).toBe('RUNNING');
    expect(walk('WAITING_FOR_HUMAN', applyRunnerNodeEvent(plan, workItemFor(plan, node, 'WAITING_FOR_HUMAN'), { type: 'started' }).transitions)).toBe('RUNNING');
  });

  it('provider completion only moves a node to VERIFYING, never to SUCCEEDED', () => {
    const outcome = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'completed' });
    expect(outcome.transitions).toEqual(['VERIFYING']);
    expect(outcome.transitions).not.toContain('SUCCEEDED');
    const fromReady = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'READY'), { type: 'completed' });
    expect(walk('READY', fromReady.transitions)).toBe('VERIFYING');
  });

  it('SUCCEEDED requires a passed evaluation report for the same work item', async () => {
    const item = workItemFor(plan, node, 'VERIFYING');
    const missing = applyRunnerNodeEvent(plan, item, { type: 'verified', report: null });
    expect(missing.transitions).toEqual([]);
    expect(missing.refused).toMatch(/report/i);

    const failed = applyRunnerNodeEvent(plan, item, { type: 'verified', report: await reportFor(plan, node, item.id, 'failed') });
    expect(failed.transitions).toEqual([]);
    expect(failed.refused).toMatch(/passed/i);

    const blocked = applyRunnerNodeEvent(plan, item, { type: 'verified', report: await reportFor(plan, node, item.id, 'blocked') });
    expect(blocked.transitions).toEqual([]);

    const foreign = applyRunnerNodeEvent(plan, item, { type: 'verified', report: await reportFor(plan, node, 'wk-other', 'passed') });
    expect(foreign.transitions).toEqual([]);

    const passed = applyRunnerNodeEvent(plan, item, { type: 'verified', report: await reportFor(plan, node, item.id, 'passed') });
    expect(passed.refused).toBeNull();
    expect(walk('VERIFYING', passed.transitions)).toBe('SUCCEEDED');

    const fromRunning = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'verified', report: await reportFor(plan, node, item.id, 'passed') });
    expect(walk('RUNNING', fromRunning.transitions)).toBe('SUCCEEDED');
  });

  it('a failed verification retries while attempts remain and fails afterwards', () => {
    const item = workItemFor(plan, node, 'VERIFYING');
    expect(node.maxAttempts).toBeGreaterThan(1);
    const retry = applyRunnerNodeEvent(plan, item, { type: 'verification_failed', attempt: 1 });
    expect(retry.transitions).toEqual(['RETRYING']);
    const exhausted = applyRunnerNodeEvent(plan, item, { type: 'verification_failed', attempt: node.maxAttempts });
    expect(exhausted.transitions).toEqual(['FAILED']);
    const fromRunning = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'verification_failed', attempt: 1 });
    expect(fromRunning.transitions).toEqual(['RETRYING']);
  });

  it('parks, cancels and blocks work with legal transitions only', () => {
    const waiting = applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'needs_human', question: 'Which branch?' });
    expect(waiting.transitions).toEqual(['WAITING_FOR_HUMAN']);
    expect(walk('READY', applyRunnerNodeEvent(plan, workItemFor(plan, node, 'READY'), { type: 'needs_human' }).transitions)).toBe('WAITING_FOR_HUMAN');

    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'cancelled' }).transitions).toEqual(['CANCELLED']);
    expect(walk('VERIFYING', applyRunnerNodeEvent(plan, workItemFor(plan, node, 'VERIFYING'), { type: 'cancelled' }).transitions)).toBe('CANCELLED');
    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'SUCCEEDED'), { type: 'cancelled' }).transitions).toEqual([]);

    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'READY'), { type: 'blocked', reason: 'prioritise failed' }).transitions).toEqual(['CANCELLED']);
    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'CANCELLED'), { type: 'blocked' }).transitions).toEqual([]);
  });

  it('never yields SUCCEEDED for any event other than a passed verification', () => {
    const events: RunnerNodeEvent[] = [
      { type: 'started' },
      { type: 'completed' },
      { type: 'verification_failed', attempt: 1 },
      { type: 'needs_human' },
      { type: 'cancelled' },
      { type: 'blocked' },
      { type: 'verified', report: null },
    ];
    const statuses: WorkItemStatus[] = ['DRAFT', 'READY', 'QUEUED', 'LEASED', 'RUNNING', 'WAITING_FOR_HUMAN', 'WAITING_FOR_DEPENDENCY', 'RETRYING', 'VERIFYING', 'FAILED', 'SUCCEEDED', 'CANCELLED'];
    for (const status of statuses) {
      for (const event of events) {
        const outcome = applyRunnerNodeEvent(plan, workItemFor(plan, node, status), event);
        expect(outcome.transitions, `${status} ${event.type}`).not.toContain('SUCCEEDED');
        walk(status, outcome.transitions);
      }
    }
    expect(applyRunnerNodeEvent(plan, workItemFor(plan, node, 'RUNNING'), { type: 'started' }).refused).toBeNull();
    expect(applyRunnerNodeEvent(plan, workItemFor({ ...plan, missionId: 'ms-other' }, node, 'RUNNING'), { type: 'completed' }).refused).toMatch(/mission/i);
  });
});

describe('deriveMissionSummary', () => {
  const plan = samplePlan();

  it('reports workers, hosts, the next dependency, approvals and verification honestly', () => {
    const byId = Object.fromEntries(plan.nodes.map((node) => [node.id, node]));
    const items = [
      workItemFor(plan, byId['research-competitor']!, 'SUCCEEDED'),
      workItemFor(plan, byId['audit-onboarding']!, 'RUNNING', { executionHostId: 'ho-claude' }),
      workItemFor(plan, byId['prioritise']!, 'READY'),
      workItemFor(plan, byId['developer-fix']!, 'READY'),
      workItemFor(plan, byId['content-draft']!, 'READY'),
      workItemFor(plan, byId['independent-verification']!, 'READY'),
      workItemFor(plan, byId['publish-approval']!, 'READY'),
    ];
    const projected = { ...plan, nodeWorkItemIds: Object.fromEntries(plan.nodes.map((node) => [node.id, `wk-${node.id}`])) };
    const summary = deriveMissionSummary(projected, items);
    expect(summary.status).toBe('running');
    expect(summary.activeWorkers).toBe(1);
    expect(summary.hosts).toEqual(['ho-claude']);
    expect(summary.nextDependency).toBe('audit-onboarding');
    expect(summary.pendingApprovals).toBe(1);
    expect(summary.verificationStatus).toBe('not_started');
    expect(summary.nodeStatuses['research-competitor']).toBe('succeeded');
    expect(summary.nodeStatuses['audit-onboarding']).toBe('running');
    expect(summary.readyNodeIds).toEqual([]);

    const waiting = deriveMissionSummary(projected, items.map((item) => item.id === 'wk-publish-approval' ? { ...item, status: 'WAITING_FOR_HUMAN' as const } : item));
    expect(waiting.status).toBe('waiting_for_human');
    expect(waiting.pendingApprovals).toBe(2);

    const failedVerify = deriveMissionSummary(projected, items.map((item) => item.id === 'wk-independent-verification' ? { ...item, status: 'FAILED' as const } : { ...item, status: item.status === 'RUNNING' ? 'SUCCEEDED' as const : item.status }));
    expect(failedVerify.verificationStatus).toBe('failed');
    expect(failedVerify.status).toBe('failed');

    const empty = deriveMissionSummary(plan, []);
    expect(empty.status).toBe(plan.status);
    expect(empty.nextDependency).toBe('research-competitor');
    expect(empty.readyNodeIds).toEqual(['research-competitor', 'audit-onboarding']);
  });
});

describe('plan projection into work items', () => {
  beforeEach(() => {
    freshDb();
  });

  it('creates one READY work item per node with mapped dependencies, capabilities, risk and proof', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Projection' }));
    const { mission, plan } = unwrap(await createOutcomeMission({ workspaceId: workspace.id, outcome: 'Ship the release', templateId: 'release-mission' }));
    const critical = unwrap(await revisePlan(workspace.id, plan.id, {
      nodes: plan.nodes.map((node) => node.id === 'developer-fix' ? { ...node, riskLevel: 'critical' as const } : node),
    }, plan.revision));

    const projected = unwrap(await projectPlanToWorkItems(workspace.id, critical.id));
    expect(projected.status).toBe('ready');
    expect(Object.keys(projected.nodeWorkItemIds).sort()).toEqual(critical.nodes.map((node) => node.id).sort());

    for (const node of critical.nodes) {
      const item = await getWorkItem(workspace.id, projected.nodeWorkItemIds[node.id]!);
      expect(item, node.id).not.toBeNull();
      if (!item) continue;
      expect(item.status).toBe('READY');
      expect(item.missionId).toBe(mission.id);
      expect(item.title).toBe(node.title);
      expect(item.requiredCapabilities).toEqual(node.requiredCapabilities);
      expect(item.dependencyIds).toEqual(node.dependencyIds.map((id) => projected.nodeWorkItemIds[id]));
      expect(item.riskLevel).toBe(node.id === 'developer-fix' ? 'high' : node.riskLevel);
    }
    const items = await getDb().workItems.where('workspaceId').equals(workspace.id).toArray();
    expect(items).toHaveLength(critical.nodes.length);

    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types.filter((type) => type === 'work.item_created')).toHaveLength(critical.nodes.length);
    expect(types.filter((type) => type === 'work.item_transitioned')).toHaveLength(critical.nodes.length);
    expect(types).toContain('mission.plan_status');

    const again = unwrap(await projectPlanToWorkItems(workspace.id, critical.id));
    expect(again.nodeWorkItemIds).toEqual(projected.nodeWorkItemIds);
    expect(await getDb().workItems.where('workspaceId').equals(workspace.id).count()).toBe(critical.nodes.length);
    expect((await projectPlanToWorkItems('ws-other', critical.id)).ok).toBe(false);
  });

  it('agents still cannot mark projected work as succeeded', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'No shortcut' }));
    const { plan } = unwrap(await createOutcomeMission({ workspaceId: workspace.id, outcome: 'Audit the repository', templateId: 'repository-audit' }));
    const projected = unwrap(await projectPlanToWorkItems(workspace.id, plan.id));
    const first = projected.nodeWorkItemIds[plan.nodes[0]!.id]!;
    for (const to of ['QUEUED', 'LEASED', 'RUNNING', 'VERIFYING'] as const) unwrap(await transitionWorkItem(workspace.id, first, to, { actorType: 'system' }));
    const denied = await transitionWorkItem(workspace.id, first, 'SUCCEEDED', { actorType: 'agent' });
    expect(denied).toMatchObject({ ok: false, error: { code: 'approval_required' } });
  });
});
