import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import { EVIDENCE_SOURCE_TYPES, TRUST_LEVELS, type EvidenceRecord, type TrustLevel } from './evidence-model.ts';

export const addEvidenceInput = z.object({
  workspaceId: z.string().min(1),
  missionId: z.string().min(1).nullish(),
  lessonId: z.string().min(1).nullish(),
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  sourceUri: z.string().url().max(2048).nullish(),
  sourceTitle: z.string().trim().max(300).nullish(),
  sourceCreator: z.string().trim().max(200).nullish(),
  timestampSeconds: z.number().min(0).max(24 * 3600).nullish(),
  claim: z.string().trim().min(1).max(2000),
  detail: z.string().trim().max(8000).optional(),
  provenanceMethod: z
    .enum([
      'user_typed',
      'user_upload',
      'creator_authorized_captions',
      'local_transcription',
      'agent_observation',
      'tool_result',
      'unknown',
    ])
    .default('user_typed'),
  confidence: z.number().min(0).max(1).default(0.5),
  transferability: z.enum(['transferable', 'source_specific', 'unknown']).default('unknown'),
});
export type AddEvidenceInput = z.input<typeof addEvidenceInput>;

export async function addEvidence(
  input: AddEvidenceInput,
  actorType: ActorType = 'human',
): Promise<Result<EvidenceRecord>> {
  const parsed = addEvidenceInput.safeParse(input);
  if (!parsed.success) return invalid('Evidence input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;

  const workspace = await getDb().workspaces.get(data.workspaceId);
  if (!workspace) return notFound('Workspace', data.workspaceId);

  const now = isoNow();
  const record: EvidenceRecord = {
    id: newId('ev'),
    workspaceId: data.workspaceId,
    missionId: data.missionId ?? null,
    lessonId: data.lessonId ?? null,
    sourceType: data.sourceType,
    sourceUri: data.sourceUri ?? null,
    sourceTitle: data.sourceTitle ?? null,
    sourceCreator: data.sourceCreator ?? null,
    timestampSeconds: data.timestampSeconds ?? null,
    claim: data.claim,
    provenanceMethod: data.provenanceMethod,
    // Everything that enters the ledger starts untrusted; only a person raises it.
    trust: 'untrusted',
    confidence: data.confidence,
    transferability: data.transferability,
    usedByNodeIds: [],
    revision: 1,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, action: 'created', actorType, summary: 'Evidence recorded' }],
  };
  if (data.detail) record.detail = data.detail;

  await withWorkspaceTx(record.workspaceId, ['evidence'], async (ctx) => {
    await ctx.db.evidence.add(record);
    ctx.emit({
      type: 'evidence.added',
      actorType,
      objectType: 'evidence',
      objectId: record.id,
      summary: `Evidence added: ${record.claim.slice(0, 120)}`,
      payload: { sourceType: record.sourceType, trust: record.trust },
    });
  });
  return ok(record);
}

export async function listEvidence(workspaceId: string, filter?: { lessonId?: string; missionId?: string }): Promise<EvidenceRecord[]> {
  let records = await getDb().evidence.where('workspaceId').equals(workspaceId).toArray();
  if (filter?.lessonId) records = records.filter((record) => record.lessonId === filter.lessonId);
  if (filter?.missionId) records = records.filter((record) => record.missionId === filter.missionId);
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getEvidence(id: string): Promise<EvidenceRecord | undefined> {
  return getDb().evidence.get(id);
}

/** Trust changes are always explicit human actions. */
export async function setEvidenceTrust(
  evidenceId: string,
  trust: TrustLevel,
  actorType: ActorType = 'human',
): Promise<Result<EvidenceRecord>> {
  if (!TRUST_LEVELS.includes(trust)) return invalid(`Unknown trust level ${trust}`);
  if (actorType !== 'human') {
    return invalid('Only a person may change the trust classification of evidence');
  }
  const db = getDb();
  const record = await db.evidence.get(evidenceId);
  if (!record) return notFound('Evidence', evidenceId);

  const now = isoNow();
  const next: EvidenceRecord = {
    ...record,
    trust,
    revision: record.revision + 1,
    updatedAt: now,
    history: [
      ...record.history,
      { at: now, action: 'trust_changed', actorType, summary: `Trust set to ${trust}` },
    ],
  };
  await withWorkspaceTx(record.workspaceId, ['evidence'], async (ctx) => {
    await ctx.db.evidence.put(next);
    ctx.emit({
      type: 'evidence.trust_changed',
      actorType,
      objectType: 'evidence',
      objectId: record.id,
      summary: `Evidence trust changed to ${trust}`,
      payload: { from: record.trust, to: trust },
    });
  });
  return ok(next);
}

export async function updateEvidence(
  evidenceId: string,
  patch: Partial<Pick<EvidenceRecord, 'claim' | 'detail' | 'confidence' | 'transferability' | 'usedByNodeIds'>>,
  actorType: ActorType = 'human',
): Promise<Result<EvidenceRecord>> {
  const db = getDb();
  const record = await db.evidence.get(evidenceId);
  if (!record) return notFound('Evidence', evidenceId);

  const now = isoNow();
  const next: EvidenceRecord = {
    ...record,
    ...patch,
    revision: record.revision + 1,
    updatedAt: now,
    history: [...record.history, { at: now, action: 'updated', actorType, summary: 'Evidence updated' }],
  };
  await withWorkspaceTx(record.workspaceId, ['evidence'], async (ctx) => {
    await ctx.db.evidence.put(next);
    ctx.emit({
      type: 'evidence.updated',
      actorType,
      objectType: 'evidence',
      objectId: record.id,
      summary: 'Evidence updated',
      payload: { fields: Object.keys(patch) },
    });
  });
  return ok(next);
}

export async function deleteEvidence(evidenceId: string, actorType: ActorType = 'human'): Promise<Result<{ deleted: string }>> {
  const db = getDb();
  const record = await db.evidence.get(evidenceId);
  if (!record) return notFound('Evidence', evidenceId);
  await withWorkspaceTx(record.workspaceId, ['evidence'], async (ctx) => {
    await ctx.db.evidence.delete(evidenceId);
    ctx.emit({
      type: 'evidence.deleted',
      actorType,
      objectType: 'evidence',
      objectId: evidenceId,
      summary: 'Evidence deleted',
    });
  });
  return ok({ deleted: evidenceId });
}
