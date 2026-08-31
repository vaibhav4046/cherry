import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { conflict, invalid, notFound } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import {
  CORRECTION_CLASSES,
  CORRECTION_CLASS_TARGET,
  type CorrectionClass,
  type MemoryProvenance,
  type MemoryRecord,
  type MemoryVersion,
} from './memory-model.ts';

export const proposeMemoryInput = z.object({
  workspaceId: z.string().min(1),
  missionId: z.string().min(1).nullish(),
  runId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  type: z.enum(['identity', 'preference', 'project', 'procedure', 'correction', 'policy', 'episode']),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(8000),
  scope: z.enum(['global', 'workspace', 'project', 'mission', 'run']),
  sensitivity: z.enum(['public', 'private', 'sensitive']).default('private'),
  confidence: z.number().min(0).max(1).default(0.6),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  provenance: z
    .array(
      z.object({
        sourceType: z.enum([
          'human',
          'video-transcript',
          'video-visual',
          'webpage',
          'repository',
          'document',
          'tool-result',
          'run',
          'correction',
          'import',
        ]),
        sourceId: z.string().min(1).nullish(),
        uri: z.string().url().max(2048).nullish(),
        timestampSeconds: z.number().min(0).optional(),
        trust: z.enum(['untrusted', 'reviewed', 'approved']).default('untrusted'),
        description: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});
export type ProposeMemoryInput = z.input<typeof proposeMemoryInput>;

/**
 * All new memory lands in the inbox as `proposed`. Nothing becomes active
 * without an explicit human approval — including agent-suggested memory built
 * from untrusted source text.
 */
export async function proposeMemory(
  input: ProposeMemoryInput,
  actorType: ActorType = 'human',
): Promise<Result<MemoryRecord>> {
  const parsed = proposeMemoryInput.safeParse(input);
  if (!parsed.success) return invalid('Memory input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;

  const workspace = await getDb().workspaces.get(data.workspaceId);
  if (!workspace) return notFound('Workspace', data.workspaceId);

  const now = isoNow();
  const provenance: MemoryProvenance[] = data.provenance.map((entry) => ({
    id: newId('mem'),
    sourceType: entry.sourceType,
    sourceId: entry.sourceId ?? null,
    uri: entry.uri ?? null,
    trust: entry.trust,
    capturedAt: now,
    description: entry.description,
    ...(typeof entry.timestampSeconds === 'number' ? { timestampSeconds: entry.timestampSeconds } : {}),
  }));

  const record: MemoryRecord = {
    schemaVersion: '1.0.0',
    id: newId('mem'),
    workspaceId: data.workspaceId,
    projectId: data.projectId ?? null,
    missionId: data.missionId ?? null,
    runId: data.runId ?? null,
    type: data.type,
    title: data.title,
    content: data.content,
    status: 'proposed',
    scope: data.scope,
    sensitivity: data.sensitivity,
    confidence: data.confidence,
    tags: data.tags,
    provenance,
    derivedFromMemoryIds: [],
    supersedesId: null,
    supersededById: null,
    revision: 1,
    approvedRevision: null,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    reviewAt: null,
    lastUsedAt: null,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await withWorkspaceTx(record.workspaceId, ['memories', 'memoryVersions'], async (ctx) => {
    await ctx.db.memories.add(record);
    await ctx.db.memoryVersions.add(makeVersion(record, 'Proposed'));
    ctx.emit({
      type: 'memory.proposed',
      actorType,
      objectType: 'memory',
      objectId: record.id,
      summary: `Memory proposed (${record.type}/${record.scope}): ${record.title}`,
      payload: { type: record.type, scope: record.scope, sensitivity: record.sensitivity },
    });
  });
  return ok(record);
}

function makeVersion(record: MemoryRecord, changeSummary: string): MemoryVersion {
  return {
    id: newId('mem'),
    workspaceId: record.workspaceId,
    memoryId: record.id,
    revision: record.revision,
    snapshot: record,
    changeSummary,
    createdAt: record.updatedAt,
  };
}

export async function decideMemory(
  memoryId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  actorType: ActorType = 'human',
): Promise<Result<MemoryRecord>> {
  if (actorType === 'agent') return invalid('Only a person may decide a memory');
  const db = getDb();
  const record = await db.memories.get(memoryId);
  if (!record) return notFound('Memory', memoryId);
  if (record.status !== 'proposed') return conflict(`Memory is ${record.status}, not proposed`);

  const now = isoNow();
  const next: MemoryRecord = {
    ...record,
    status: decision,
    approvedRevision: decision === 'approved' ? record.revision : null,
    approvedBy: decision === 'approved' ? decidedBy : null,
    approvedAt: decision === 'approved' ? now : null,
    revision: record.revision + 1,
    updatedAt: now,
  };

  await withWorkspaceTx(record.workspaceId, ['memories', 'memoryVersions'], async (ctx) => {
    await ctx.db.memories.put(next);
    await ctx.db.memoryVersions.add(makeVersion(next, `${decision} by ${decidedBy}`));
    ctx.emit({
      type: decision === 'approved' ? 'memory.approved' : 'memory.rejected',
      actorType: 'human',
      objectType: 'memory',
      objectId: record.id,
      summary: `Memory "${record.title}" ${decision}`,
      payload: { decision },
    });
  });
  return ok(next);
}

export async function supersedeMemory(
  oldMemoryId: string,
  replacement: ProposeMemoryInput,
  actorType: ActorType = 'human',
): Promise<Result<{ superseded: MemoryRecord; proposal: MemoryRecord }>> {
  const db = getDb();
  const old = await db.memories.get(oldMemoryId);
  if (!old) return notFound('Memory', oldMemoryId);

  const now = isoNow();
  if (replacement.workspaceId !== old.workspaceId) return conflict('Replacement memory must be in the same workspace');
  const parsed = proposeMemoryInput.safeParse(replacement);
  if (!parsed.success) return invalid('Memory input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;
  const proposalRecord: MemoryRecord = {
    schemaVersion: '1.0.0', id: newId('mem'), workspaceId: old.workspaceId, projectId: data.projectId ?? null,
    missionId: data.missionId ?? null, runId: data.runId ?? null, type: data.type, title: data.title, content: data.content,
    status: 'proposed', scope: data.scope, sensitivity: data.sensitivity, confidence: data.confidence, tags: data.tags,
    provenance: data.provenance.map((entry) => ({ id: newId('mem'), sourceType: entry.sourceType, sourceId: entry.sourceId ?? null, uri: entry.uri ?? null, trust: entry.trust, capturedAt: now, description: entry.description, ...(typeof entry.timestampSeconds === 'number' ? { timestampSeconds: entry.timestampSeconds } : {}) })),
    derivedFromMemoryIds: [], supersedesId: old.id, supersededById: null, revision: 1, approvedRevision: null, approvedBy: null, approvedAt: null, expiresAt: null, reviewAt: null, lastUsedAt: null, useCount: 0, createdAt: now, updatedAt: now,
  };
  const supersededOld: MemoryRecord = {
    ...old,
    status: 'superseded',
    supersededById: proposalRecord.id,
    revision: old.revision + 1,
    updatedAt: now,
  };
  await withWorkspaceTx(old.workspaceId, ['memories', 'memoryVersions'], async (ctx) => {
    await ctx.db.memories.put(supersededOld);
    await ctx.db.memories.add(proposalRecord);
    await ctx.db.memoryVersions.add(makeVersion(proposalRecord, `Supersedes ${old.id}`));
    await ctx.db.memoryVersions.add(makeVersion(supersededOld, `Superseded by ${proposalRecord.id}`));
    ctx.emit({
      type: 'memory.superseded',
      actorType,
      objectType: 'memory',
      objectId: old.id,
      summary: `Memory superseded by proposal ${proposalRecord.id}`,
      payload: { supersededById: proposalRecord.id },
    });
  });
  return ok({ superseded: supersededOld, proposal: proposalRecord });
}

export async function deleteMemory(memoryId: string, actorType: ActorType = 'human'): Promise<Result<{ deleted: string }>> {
  const db = getDb();
  const record = await db.memories.get(memoryId);
  if (!record) return notFound('Memory', memoryId);
  await withWorkspaceTx(record.workspaceId, ['memories', 'memoryVersions'], async (ctx) => {
    await ctx.db.memories.delete(memoryId);
    await ctx.db.memoryVersions.add({ ...makeVersion({ ...record, status: 'deleted', title: '[redacted]', content: '[redacted]' }, 'Deleted'), snapshot: { ...record, status: 'deleted', title: '[redacted]', content: '[redacted]' } });
    ctx.emit({
      type: 'memory.deleted',
      actorType,
      objectType: 'memory',
      objectId: memoryId,
      summary: `Memory ${memoryId} deleted (content redacted)`,
      payload: { redacted: true },
    });
  });
  return ok({ deleted: memoryId });
}

export async function setMemoryPinned(memoryId: string, pinned: boolean): Promise<Result<MemoryRecord>> {
  const db = getDb();
  const record = await db.memories.get(memoryId);
  if (!record) return notFound('Memory', memoryId);
  const next: MemoryRecord = { ...record, pinned, revision: record.revision + 1, updatedAt: isoNow() };
  await withWorkspaceTx(record.workspaceId, ['memories', 'memoryVersions'], async (ctx) => {
    await ctx.db.memories.put(next);
    await ctx.db.memoryVersions.add(makeVersion(next, pinned ? 'Pinned' : 'Unpinned'));
    ctx.emit({ type: 'memory.pinned', actorType: 'human', objectType: 'memory', objectId: memoryId, summary: `Memory ${pinned ? 'pinned' : 'unpinned'}`, payload: { pinned, revision: next.revision } });
  });
  return ok(next);
}

export async function listMemories(
  workspaceId: string,
  filter?: { status?: MemoryRecord['status']; type?: MemoryRecord['type']; scope?: MemoryRecord['scope'] },
): Promise<MemoryRecord[]> {
  let records = await getDb().memories.where('workspaceId').equals(workspaceId).toArray();
  if (filter?.status) records = records.filter((record) => record.status === filter.status);
  if (filter?.type) records = records.filter((record) => record.type === filter.type);
  if (filter?.scope) records = records.filter((record) => record.scope === filter.scope);
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMemory(id: string): Promise<MemoryRecord | undefined> {
  return getDb().memories.get(id);
}

export const compileCorrectionInput = z.object({
  workspaceId: z.string().min(1),
  missionId: z.string().min(1).nullish(),
  runId: z.string().min(1).nullish(),
  correctionClass: z.enum(CORRECTION_CLASSES),
  whatFailed: z.string().trim().min(1).max(4000),
  approvedFix: z.string().trim().min(1).max(4000),
  sourceEvidenceId: z.string().min(1).nullish(),
});
export type CompileCorrectionInput = z.input<typeof compileCorrectionInput>;

/**
 * Correction Compiler (Cherry Reflex): classify a correction, then create a
 * scoped memory proposal that links back to the failure. It still lands in the
 * inbox — classification does not skip approval.
 */
export async function compileCorrection(
  input: CompileCorrectionInput,
  actorType: ActorType = 'human',
): Promise<Result<{ memory: MemoryRecord; correctionClass: CorrectionClass; createsAssertion: boolean }>> {
  const parsed = compileCorrectionInput.safeParse(input);
  if (!parsed.success) return invalid('Correction input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;
  const target = CORRECTION_CLASS_TARGET[data.correctionClass];

  const memory = await proposeMemory(
    {
      workspaceId: data.workspaceId,
      missionId: data.missionId ?? null,
      runId: data.runId ?? null,
      type: 'correction',
      title: `Correction (${target.label}): ${data.whatFailed.slice(0, 120)}`,
      content: `WHAT FAILED\n${data.whatFailed}\n\nAPPROVED FIX\n${data.approvedFix}`,
      scope: target.scope,
      sensitivity: 'private',
      confidence: 0.8,
      tags: ['correction', data.correctionClass],
      provenance: [
        {
          sourceType: 'correction',
          sourceId: data.sourceEvidenceId ?? data.runId ?? null,
          trust: 'reviewed',
          description: `Correction classified as ${target.label} by the user`,
        },
      ],
    },
    actorType,
  );
  if (!memory.ok) return memory;
  return ok({ memory: memory.value, correctionClass: data.correctionClass, createsAssertion: target.createsAssertion });
}
