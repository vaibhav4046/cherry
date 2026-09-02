import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { computeEvaluationReportHash, type EvaluationCheck } from '../../src/cherry/workforce/mission-plan-model.ts';
import { createOutcomeMission, projectPlanToWorkItems } from '../../src/cherry/workforce/mission-plan-service.ts';
import {
  listEvaluationReports,
  recordEvaluationReport,
  repairBudget,
  summariseChecks,
} from '../../src/cherry/workforce/evaluation-service.ts';

function check(id: string, status: EvaluationCheck['status'], required = true): EvaluationCheck {
  return { id, kind: 'file', required, status, detail: `${id} ${status}` };
}

describe('summariseChecks', () => {
  it('fails when a required check is missing or was not run', () => {
    expect(summariseChecks([check('a', 'passed')], ['a', 'b'])).toMatchObject({ status: 'failed', missingRequiredIds: ['b'] });
    expect(summariseChecks([check('a', 'passed'), check('b', 'not_run')], ['a', 'b'])).toMatchObject({ status: 'failed', notRun: 1 });
    expect(summariseChecks([], ['a'])).toMatchObject({ status: 'failed' });
    expect(summariseChecks([], [])).toMatchObject({ status: 'failed' });
  });

  it('never counts blocked as passed and lets optional checks fail without failing the report', () => {
    expect(summariseChecks([check('a', 'passed'), check('b', 'blocked')], ['a', 'b'])).toMatchObject({ status: 'blocked', blocked: 1 });
    expect(summariseChecks([check('a', 'passed'), check('b', 'blocked', false)], ['a'])).toMatchObject({ status: 'passed' });
    expect(summariseChecks([check('a', 'passed'), check('opt', 'failed', false)], ['a'])).toMatchObject({ status: 'passed', failed: 1 });
    expect(summariseChecks([check('a', 'failed'), check('b', 'blocked')], ['a', 'b'])).toMatchObject({ status: 'failed', failedRequiredIds: ['a'] });
    expect(summariseChecks([check('a', 'passed'), check('b', 'passed')], ['a', 'b'])).toMatchObject({ status: 'passed', passed: 2, failed: 0, blocked: 0, notRun: 0 });
    // A check that declares itself required counts even when the caller forgot to list it.
    expect(summariseChecks([check('a', 'passed'), check('c', 'failed', true)], ['a'])).toMatchObject({ status: 'failed' });
  });
});

describe('repairBudget', () => {
  it('allows one repair in RED and two otherwise', () => {
    expect(repairBudget('RED')).toBe(1);
    expect(repairBudget('AMBER')).toBe(2);
    expect(repairBudget('GREEN')).toBe(2);
  });
});

describe('recordEvaluationReport', () => {
  beforeEach(() => {
    freshDb();
  });

  it('derives the status from the plan\'s required checks and never records a claimed pass', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Evaluation' }));
    const { mission, plan } = unwrap(await createOutcomeMission({ workspaceId: workspace.id, outcome: 'Ship the release', templateId: 'release-mission' }));
    const projected = unwrap(await projectPlanToWorkItems(workspace.id, plan.id));
    const node = projected.nodes.find((candidate) => candidate.id === 'prioritise')!;
    const workItemId = projected.nodeWorkItemIds[node.id]!;
    const requiredIds = node.verificationPlan.filter((spec) => spec.required).map((spec) => spec.id);
    expect(requiredIds.length).toBeGreaterThan(1);

    const claimed = unwrap(await recordEvaluationReport({
      workspaceId: workspace.id,
      missionId: mission.id,
      workItemId,
      workerRunId: 'job-1',
      checks: [check(requiredIds[0]!, 'passed')],
      status: 'passed',
    }));
    expect(claimed.status).toBe('failed');
    expect(claimed.nodeId).toBe('prioritise');
    expect(claimed.planRevision).toBe(projected.revision);
    expect(claimed.attempt).toBe(1);
    expect(claimed.workerRunId).toBe('job-1');
    expect(claimed.contentHash).toBe(await computeEvaluationReportHash(claimed));
    expect(claimed.summary).toMatch(/missing/i);

    const passed = unwrap(await recordEvaluationReport({
      workspaceId: workspace.id,
      missionId: mission.id,
      workItemId,
      workerRunId: 'job-2',
      checks: requiredIds.map((id) => check(id, 'passed')),
      status: 'passed',
    }));
    expect(passed.status).toBe('passed');
    expect(passed.attempt).toBe(2);
    expect(passed.contentHash).not.toBe(claimed.contentHash);

    const downgraded = unwrap(await recordEvaluationReport({
      workspaceId: workspace.id,
      missionId: mission.id,
      workItemId,
      workerRunId: 'job-3',
      checks: requiredIds.map((id) => check(id, 'passed')),
      status: 'blocked',
    }));
    expect(downgraded.status).toBe('blocked');

    const reports = await listEvaluationReports(workspace.id, mission.id);
    expect(reports.map((report) => report.attempt)).toEqual([1, 2, 3]);
    expect(await listEvaluationReports(workspace.id, 'ms-other')).toEqual([]);
    expect((await listEvaluationReports(workspace.id)).length).toBe(3);

    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types.filter((type) => type === 'evaluation.recorded')).toHaveLength(3);
  });

  it('refuses reports for unknown work items, other workspaces or the wrong mission', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Evaluation' }));
    const { mission, plan } = unwrap(await createOutcomeMission({ workspaceId: workspace.id, outcome: 'Audit the repository', templateId: 'repository-audit' }));
    const projected = unwrap(await projectPlanToWorkItems(workspace.id, plan.id));
    const workItemId = projected.nodeWorkItemIds[projected.nodes[0]!.id]!;
    const base = { workspaceId: workspace.id, missionId: mission.id, workItemId, workerRunId: 'job-1', checks: [check('x', 'passed')], status: 'passed' as const };
    expect(await recordEvaluationReport({ ...base, workItemId: 'wk-missing' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await recordEvaluationReport({ ...base, workspaceId: 'ws-other' })).toMatchObject({ ok: false });
    expect(await recordEvaluationReport({ ...base, missionId: 'ms-other' })).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(await listEvaluationReports(workspace.id)).toEqual([]);
  });
});
