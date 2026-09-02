/**
 * Independent evaluation: a node succeeds only through a report whose required
 * checks passed. The caller may claim a status; the recorded status is never
 * better than what the checks show. Required checks come from the plan node,
 * so a worker cannot shrink its own bar. Reports persist with a ProofEvent.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import {
  computeEvaluationReportHash,
  type EvaluationCheck,
  type EvaluationReport,
  type EvaluationStatus,
  type EvaluatorKind,
} from './mission-plan-model.ts';
import { getPlanForMission } from './mission-plan-service.ts';

export { computeEvaluationReportHash };
export type { EvaluationCheck, EvaluationReport, EvaluationStatus, EvaluatorKind, EvaluationCheckStatus } from './mission-plan-model.ts';

export interface CheckSummary {
  status: EvaluationStatus;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  missingRequiredIds: string[];
  failedRequiredIds: string[];
  blockedRequiredIds: string[];
}

/**
 * Required ids come from the caller plus every check that declares itself
 * required. A missing or not_run required check fails the report; a blocked
 * required check blocks it; blocked never counts as passed. Optional checks
 * are recorded but do not change the verdict.
 */
export function summariseChecks(checks: readonly EvaluationCheck[], requiredIds: readonly string[]): CheckSummary {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const required = [...new Set([...requiredIds, ...checks.filter((check) => check.required).map((check) => check.id)])];
  const missingRequiredIds = required.filter((id) => !byId.has(id));
  const failedRequiredIds = required.filter((id) => byId.get(id)?.status === 'failed');
  const notRunRequiredIds = required.filter((id) => byId.get(id)?.status === 'not_run');
  const blockedRequiredIds = required.filter((id) => byId.get(id)?.status === 'blocked');
  const count = (status: EvaluationCheck['status']): number => checks.filter((check) => check.status === status).length;

  let status: EvaluationStatus;
  if (required.length === 0 || missingRequiredIds.length > 0 || failedRequiredIds.length > 0 || notRunRequiredIds.length > 0) status = 'failed';
  else if (blockedRequiredIds.length > 0) status = 'blocked';
  else status = 'passed';

  return {
    status,
    passed: count('passed'),
    failed: count('failed'),
    blocked: count('blocked'),
    notRun: count('not_run'),
    missingRequiredIds,
    failedRequiredIds: [...failedRequiredIds, ...notRunRequiredIds],
    blockedRequiredIds,
  };
}

export type ModeLabel = 'RED' | 'AMBER' | 'GREEN';

/** Bounded repair: one retry with the failed checks appended in RED, two otherwise. */
export function repairBudget(mode: ModeLabel): number {
  return mode === 'RED' ? 1 : 2;
}

const STATUS_SEVERITY: Readonly<Record<EvaluationStatus, number>> = { passed: 0, blocked: 1, failed: 2 };

function worstStatus(a: EvaluationStatus, b: EvaluationStatus): EvaluationStatus {
  return STATUS_SEVERITY[a] >= STATUS_SEVERITY[b] ? a : b;
}

export interface RecordEvaluationInput {
  workspaceId: string;
  missionId: string;
  workItemId: string;
  workerRunId: string;
  checks: EvaluationCheck[];
  /** What the evaluator concluded; the recorded status is never better than the checks allow. */
  status: EvaluationStatus;
  /** Extra required check ids; the plan node's required checks always apply. */
  requiredIds?: string[];
  summary?: string;
  evaluatorKind?: EvaluatorKind;
}

export async function recordEvaluationReport(input: RecordEvaluationInput): Promise<Result<EvaluationReport>> {
  const workItem = await getDb().workItems.get(input.workItemId);
  if (!workItem || workItem.workspaceId !== input.workspaceId) return err('not_found', 'Work item not found.');
  if (workItem.missionId !== input.missionId) return err('validation', 'The work item belongs to a different mission.');
  const plan = await getPlanForMission(input.workspaceId, input.missionId);
  const nodeId = plan ? Object.keys(plan.nodeWorkItemIds).find((id) => plan.nodeWorkItemIds[id] === input.workItemId) ?? null : null;
  const node = plan && nodeId ? plan.nodes.find((candidate) => candidate.id === nodeId) ?? null : null;
  if (!plan || !nodeId || !node) return err('validation', 'The work item is not projected from the mission plan.');

  const requiredIds = [...new Set([...node.verificationPlan.filter((spec) => spec.required).map((spec) => spec.id), ...(input.requiredIds ?? [])])];
  const summary = summariseChecks(input.checks, requiredIds);
  const status = worstStatus(input.status, summary.status);
  const previous = await getDb().evaluationReports.where('workItemId').equals(input.workItemId).toArray();
  const attempt = previous.filter((report) => report.workspaceId === input.workspaceId).length + 1;
  const evaluatorKind = input.evaluatorKind ?? 'cherry-check';
  const detail = [
    `${summary.passed} passed, ${summary.failed} failed, ${summary.blocked} blocked, ${summary.notRun} not run`,
    summary.missingRequiredIds.length > 0 ? `missing required: ${summary.missingRequiredIds.join(', ')}` : '',
    summary.failedRequiredIds.length > 0 ? `failed required: ${summary.failedRequiredIds.join(', ')}` : '',
    summary.blockedRequiredIds.length > 0 ? `blocked required: ${summary.blockedRequiredIds.join(', ')}` : '',
  ].filter(Boolean).join('; ');

  const report: EvaluationReport = {
    id: newId('er'),
    workspaceId: input.workspaceId,
    missionId: input.missionId,
    workItemId: input.workItemId,
    workerRunId: input.workerRunId,
    nodeId,
    planRevision: plan.revision,
    attempt,
    status,
    checks: input.checks.map((check) => ({ ...check })),
    summary: input.summary ? `${input.summary} (${detail})` : detail,
    evaluatorKind,
    contentHash: '',
    createdAt: isoNow(),
  };
  // Hashing is async non-Dexie work, so it happens before the transaction.
  report.contentHash = await computeEvaluationReportHash(report);

  return withWorkspaceTx(input.workspaceId, ['evaluationReports', 'workItems'], async (ctx) => {
    const current = await ctx.db.workItems.get(input.workItemId);
    if (!current || current.workspaceId !== input.workspaceId) return err('not_found', 'Work item not found.');
    await ctx.db.evaluationReports.add(report);
    ctx.emit({
      type: 'evaluation.recorded',
      actorType: evaluatorKind === 'human' ? 'human' : 'runner',
      objectType: 'evaluation_report',
      objectId: report.id,
      summary: `Evaluation ${status} for "${current.title}" (attempt ${attempt}): ${detail}`,
      payload: {
        workItemId: report.workItemId,
        missionId: report.missionId,
        nodeId,
        workerRunId: report.workerRunId,
        status,
        claimedStatus: input.status,
        attempt,
        planRevision: report.planRevision,
        contentHash: report.contentHash,
        passed: summary.passed,
        failed: summary.failed,
        blocked: summary.blocked,
        notRun: summary.notRun,
      },
    });
    return ok(report);
  });
}

export async function listEvaluationReports(workspaceId: string, missionId?: string): Promise<EvaluationReport[]> {
  const reports = await getDb().evaluationReports.where('workspaceId').equals(workspaceId).toArray();
  return reports
    .filter((report) => missionId === undefined || report.missionId === missionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.attempt - b.attempt || a.id.localeCompare(b.id));
}
