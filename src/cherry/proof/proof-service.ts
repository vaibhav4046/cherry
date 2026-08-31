import { getDb } from '../persistence/cherry-db.ts';
import { listProofEvents, withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256CanonicalExcluding } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import type { ProofEvent } from '../core/domain-event.ts';
import type {
  ProofApproval,
  ProofArtifact,
  ProofAssertion,
  ProofFailureRepair,
  ProofReceipt,
  ProofReceiptEvent,
} from './proof-model.ts';
import { RECEIPT_HASH_EXCLUSIONS } from './proof-model.ts';
import { listArtifactFiles } from '../artifacts/artifact-service.ts';

function toReceiptEvent(event: ProofEvent): ProofReceiptEvent {
  return {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    occurredAt: event.occurredAt,
    objectType: event.objectType,
    objectId: event.objectId,
    summary: event.summary,
    payloadHash: event.payloadHash ?? null,
  };
}

/**
 * A receipt is generated entirely from the persisted event ledger, approvals,
 * artifacts, and verification results. It is tamper-evident through SHA-256
 * over its RFC 8785 canonical form — Cherry never calls this a signature.
 */
export async function createProofReceipt(missionId: string): Promise<Result<ProofReceipt>> {
  const db = getDb();
  const mission = await db.missions.get(missionId);
  if (!mission) return notFound('Mission', missionId);
  if (!mission.skillGraphId) return invalid('Mission has no skill graph; a receipt needs one');
  const graph = await db.skillGraphs.get(mission.skillGraphId);
  if (!graph) return notFound('SkillGraph', mission.skillGraphId);

  const [events, runs, artifactFiles, verificationRows, evidenceRows, memoryRows] = await Promise.all([
    listProofEvents(mission.workspaceId),
    db.runs.where('missionId').equals(mission.id).toArray(),
    mission.artifactSetId ? db.artifactFiles.where('artifactSetId').equals(mission.artifactSetId).toArray() : Promise.resolve([]),
    db.verifications.where('workspaceId').equals(mission.workspaceId).toArray(),
    db.evidence.where('workspaceId').equals(mission.workspaceId).toArray(),
    db.memories.where('workspaceId').equals(mission.workspaceId).toArray(),
  ]);
  const missionRunIds = new Set(runs.map((r) => r.id));
  const missionVerificationIds = new Set(verificationRows.filter((v) => v.missionId === mission.id).map((v) => v.id));
  const causalIds = new Set([mission.id, graph.id, ...(mission.lessonId ? [mission.lessonId] : []), ...(mission.artifactSetId ? [mission.artifactSetId] : []), ...missionRunIds, ...missionVerificationIds, ...artifactFiles.map((f) => f.id), ...graph.nodes.map((n) => n.id), ...evidenceRows.filter((e) => e.missionId === mission.id || (mission.lessonId && e.lessonId === mission.lessonId)).map((e) => e.id), ...memoryRows.filter((m) => m.missionId === mission.id || (m.scope === 'workspace' && m.workspaceId === mission.workspaceId)).map((m) => m.id)]);
  const causalTypes = new Set(['mission.created', 'mission.updated', 'mission.state_changed', 'lesson.loaded', 'lesson.transcript_imported', 'lesson.playback', 'observation.recorded', 'evidence.added', 'evidence.updated', 'evidence.trust_changed', 'evidence.deleted', 'skillgraph.drafted', 'skillgraph.revised', 'skillgraph.approval_requested', 'skillgraph.approved', 'skillgraph.rejected', 'skillgraph.rolled_back', 'memory.proposed', 'memory.approved', 'memory.rejected', 'memory.superseded', 'memory.deleted', 'memory.pinned', 'artifact.file_written', 'artifact.file_deleted', 'artifact.preview_error', 'verification.started', 'verification.completed', 'repair.applied', 'run.queued', 'run.updated', 'receipt.created']);
  const missionEvents = events.filter((event) => causalTypes.has(event.type) && (causalIds.has(event.objectId) || (event.objectType === 'run' && missionRunIds.has(event.objectId))));

  const approvals = (await db.approvals.where('workspaceId').equals(mission.workspaceId).toArray())
    .filter((approval) => approval.decision !== 'pending' && causalIds.has(approval.objectId))
    .map<ProofApproval>((approval) => ({
      id: approval.id,
      objectType: approval.objectType === 'consequential_action' ? 'runner-job' : (approval.objectType as ProofApproval['objectType']),
      objectId: approval.objectId,
      objectRevision: approval.objectRevision,
      decision: approval.decision as 'approved' | 'rejected',
      decidedBy: approval.decidedBy ?? 'user',
      decidedAt: approval.decidedAt ?? approval.requestedAt,
      ...(approval.comment ? { comment: approval.comment } : {}),
      ...(approval.contentHash ? { contentHash: approval.contentHash } : {}),
    }));

  const artifacts: ProofArtifact[] = mission.artifactSetId
    ? (await listArtifactFiles(mission.artifactSetId)).map((file) => ({
        path: file.path,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        artifactRevision: file.revision,
      }))
    : [];

  const verifications = (await db.verifications.where('workspaceId').equals(mission.workspaceId).toArray())
    .filter((report) => report.missionId === mission.id)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const latest = verifications[verifications.length - 1];
  const assertions: ProofAssertion[] = latest
    ? latest.results.map((result) => ({
        id: result.id,
        name: result.name,
        type: result.type,
        severity: result.severity,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        evidence: result.evidence,
        ...(result.actual !== undefined ? { actual: result.actual } : {}),
        ...(result.expected !== undefined ? { expected: result.expected } : {}),
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      }))
    : [];

  // Failure/repair pairs: a failed report followed by repair events and a later
  // passed run of the same assertion name.
  const failuresAndRepairs: ProofFailureRepair[] = [];
  for (let index = 0; index < verifications.length - 1; index += 1) {
    const failedReport = verifications[index]!;
    for (const failed of failedReport.results.filter((result) => result.status === 'failed')) {
      for (let later = index + 1; later < verifications.length; later += 1) {
        const repaired = verifications[later]!.results.find(
          (result) => result.name === failed.name && result.status === 'passed',
        );
        if (repaired) {
          const repairEvents = missionEvents
            .filter((event) => event.type === 'repair.applied' && event.occurredAt >= failed.finishedAt)
            .map((event) => event.id);
          failuresAndRepairs.push({
            failureAssertionId: failed.id,
            failedAt: failed.finishedAt,
            ...(repairEvents.length > 0 ? { repairEventIds: repairEvents.slice(0, 20) } : {}),
            repairSummary:
              missionEvents.find((event) => event.type === 'repair.applied' && event.occurredAt >= failed.finishedAt)
                ?.summary ?? 'Repaired and re-verified',
            reverifiedAssertionId: repaired.id,
          });
          break;
        }
      }
    }
  }

  const status: ProofReceipt['status'] = latest
    ? latest.status === 'passed'
      ? 'verified'
      : 'failed'
    : 'blocked';

  const eventLimit = 2000;
  const omittedCount = Math.max(0, missionEvents.length - eventLimit);
  const receipt: ProofReceipt = {
    schemaVersion: '1.0.0',
    receiptId: newId('rc'),
    workspaceId: mission.workspaceId,
    missionId: mission.id,
    runId: runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null,
    skillGraphId: graph.id,
    skillGraphVersion: graph.version,
    skillGraphRevision: graph.revision,
    status,
    canonicalization: {
      algorithm: 'JCS-RFC8785',
      hashAlgorithm: 'SHA-256',
      exclusions: [...RECEIPT_HASH_EXCLUSIONS],
    },
    events: missionEvents.slice(-eventLimit).map(toReceiptEvent),
    approvals,
    artifacts,
    assertions,
    failuresAndRepairs,
    exports: [],
    provider: (() => { const run = runs.find((r) => r.id === (runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id)); return run?.provider ? { kind: run.provider.kind as 'manual', status: run.provider.status as 'not-used', verifiedSeparately: true, exitCode: run.provider.exitCode ?? null } : { kind: 'manual' as const, status: 'not-used' as const, verifiedSeparately: true, exitCode: null }; })(),
    receiptHash: '',
    createdAt: isoNow(),
    truncation: { truncated: omittedCount > 0, omittedCount },
  };

  receipt.receiptHash = await sha256CanonicalExcluding(
    receipt as unknown as Record<string, unknown>,
    RECEIPT_HASH_EXCLUSIONS,
  );

  await withWorkspaceTx(mission.workspaceId, ['receipts'], async (ctx) => {
    await ctx.db.receipts.add(receipt);
    ctx.emit({
      type: 'receipt.created',
      actorType: 'system',
      objectType: 'receipt',
      objectId: receipt.receiptId,
      summary: `Proof receipt created (${receipt.status}, hash ${receipt.receiptHash.slice(0, 12)}…)`,
      payload: { status: receipt.status, receiptHash: receipt.receiptHash },
    });
  });
  return ok(receipt);
}

export async function getReceipt(receiptId: string): Promise<ProofReceipt | undefined> {
  return getDb().receipts.get(receiptId);
}

export async function listReceipts(workspaceId: string): Promise<ProofReceipt[]> {
  const receipts = await getDb().receipts.where('workspaceId').equals(workspaceId).toArray();
  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
