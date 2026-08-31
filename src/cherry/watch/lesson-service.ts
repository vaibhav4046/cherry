import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import { parseYouTubeUrl } from './youtube-url.ts';
import { parseTranscript } from './transcript-parser.ts';
import { computeCoverage } from './coverage.ts';
import type {
  CoverageCriterion,
  CoverageReport,
  Lesson,
  Observation,
  TranscriptSegment,
  TranscriptSource,
} from './watch-model.ts';

export const loadLessonInput = z.object({
  workspaceId: z.string().min(1),
  missionId: z.string().min(1).nullish(),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().max(2048).optional(),
  kind: z.enum(['youtube', 'manual']).default('manual'),
  creator: z.string().trim().max(200).optional(),
  permissionAcknowledged: z.boolean().default(false),
  permissionNote: z.string().trim().max(1000).optional(),
});
export type LoadLessonInput = z.input<typeof loadLessonInput>;

export async function loadLesson(input: LoadLessonInput, actorType: ActorType = 'human'): Promise<Result<Lesson>> {
  const parsed = loadLessonInput.safeParse(input);
  if (!parsed.success) return invalid('Lesson input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;

  const workspace = await getDb().workspaces.get(data.workspaceId);
  if (!workspace) return notFound('Workspace', data.workspaceId);

  let videoId: string | null = null;
  let canonicalUrl: string | null = null;
  if (data.kind === 'youtube') {
    if (!data.url) return invalid('A YouTube lesson needs a URL or video id');
    const parsedUrl = parseYouTubeUrl(data.url);
    if (!parsedUrl.ok) return parsedUrl;
    videoId = parsedUrl.value.videoId;
    canonicalUrl = parsedUrl.value.canonicalUrl;
    if (!data.permissionAcknowledged) {
      return invalid('Acknowledge that you are permitted to learn from this source before loading it', {
        field: 'permissionAcknowledged',
      });
    }
  }

  const now = isoNow();
  const lesson: Lesson = {
    id: newId('ls'),
    workspaceId: data.workspaceId,
    missionId: data.missionId ?? null,
    title: data.title,
    videoId,
    canonicalUrl,
    creator: data.creator ?? null,
    kind: data.kind,
    durationSeconds: null,
    permissionAcknowledgedAt: data.permissionAcknowledged ? now : null,
    coverageCriteria: [],
    lastPositionSeconds: 0,
    transcriptSource: null,
    transcriptImportedAt: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (data.permissionNote) lesson.permissionNote = data.permissionNote;

  await withWorkspaceTx(lesson.workspaceId, ['lessons'], async (ctx) => {
    await ctx.db.lessons.add(lesson);
    ctx.emit({
      type: 'lesson.loaded',
      actorType,
      objectType: 'lesson',
      objectId: lesson.id,
      summary: `Lesson "${lesson.title}" loaded (${lesson.kind})`,
      payload: { kind: lesson.kind, videoId: lesson.videoId ?? null },
    });
  });
  return ok(lesson);
}

export async function getLesson(id: string): Promise<Lesson | undefined> {
  return getDb().lessons.get(id);
}

export async function listLessons(workspaceId: string): Promise<Lesson[]> {
  const lessons = await getDb().lessons.where('workspaceId').equals(workspaceId).toArray();
  return lessons.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateLesson(
  lessonId: string,
  patch: Partial<Pick<Lesson, 'title' | 'durationSeconds' | 'lastPositionSeconds' | 'creator' | 'coverageCriteria' | 'missionId'>>,
  actorType: ActorType = 'human',
): Promise<Result<Lesson>> {
  const db = getDb();
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) return notFound('Lesson', lessonId);
  const next: Lesson = { ...lesson, ...patch, revision: lesson.revision + 1, updatedAt: isoNow() };
  await withWorkspaceTx(lesson.workspaceId, ['lessons'], async (ctx) => {
    await ctx.db.lessons.put(next);
    ctx.emit({ type: 'lesson.updated', actorType, objectType: 'lesson', objectId: lesson.id, summary: `Lesson "${next.title}" updated`, payload: { fields: Object.keys(patch) } });
  });
  return ok(next);
}

export async function importTranscript(
  lessonId: string,
  content: string,
  source: TranscriptSource,
  fileName?: string,
  actorType: ActorType = 'human',
  mode: 'replace' | 'append' = 'replace',
): Promise<Result<{ lesson: Lesson; segmentCount: number; totalSegments: number }>> {
  const db = getDb();
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) return notFound('Lesson', lessonId);

  const parsed = parseTranscript(content, fileName);
  if (!parsed.ok) return parsed;

  // Append mode (multi-source drops): keep existing segments and place the new
  // source after them. Untimed sources get shifted past the current end so the
  // combined timeline stays monotonic; explicitly-timed sources keep their own
  // timestamps.
  const existing = mode === 'append' ? await db.transcriptSegments.where('lessonId').equals(lesson.id).toArray() : [];
  const existingEnd = existing.reduce((max, segment) => Math.max(max, segment.endSeconds), 0);
  const indexOffset = existing.length;
  const firstStart = parsed.value.segments[0]?.startSeconds ?? 0;
  const timeOffset = mode === 'append' && firstStart < existingEnd ? existingEnd + 2 : 0;

  const now = isoNow();
  const segments: TranscriptSegment[] = parsed.value.segments.map((segment) => ({
    id: newId('seg'),
    workspaceId: lesson.workspaceId,
    lessonId: lesson.id,
    index: indexOffset + segment.index,
    startSeconds: segment.startSeconds + timeOffset,
    endSeconds: segment.endSeconds + timeOffset,
    text: segment.text,
    source,
  }));

  const nextLesson: Lesson = {
    ...lesson,
    transcriptSource: source,
    transcriptImportedAt: now,
    revision: lesson.revision + 1,
    updatedAt: now,
  };

  await withWorkspaceTx(lesson.workspaceId, ['lessons', 'transcriptSegments'], async (ctx) => {
    if (mode === 'replace') {
      await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).delete();
    }
    await ctx.db.transcriptSegments.bulkAdd(segments);
    await ctx.db.lessons.put(nextLesson);
    ctx.emit({
      type: 'lesson.transcript_imported',
      actorType,
      objectType: 'lesson',
      objectId: lesson.id,
      summary: `Transcript ${mode === 'append' ? 'source added' : 'imported'} (${segments.length} segments, source: ${source})`,
      payload: { segmentCount: segments.length, source, format: parsed.value.format, mode },
    });
  });
  return ok({ lesson: nextLesson, segmentCount: segments.length, totalSegments: existing.length + segments.length });
}

export async function deleteTranscript(lessonId: string, actorType: ActorType = 'human'): Promise<Result<Lesson>> {
  const db = getDb();
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) return notFound('Lesson', lessonId);
  const next: Lesson = {
    ...lesson,
    transcriptSource: null,
    transcriptImportedAt: null,
    revision: lesson.revision + 1,
    updatedAt: isoNow(),
  };
  await withWorkspaceTx(lesson.workspaceId, ['lessons', 'transcriptSegments'], async (ctx) => {
    await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).delete();
    await ctx.db.lessons.put(next);
    ctx.emit({
      type: 'lesson.transcript_imported',
      actorType,
      objectType: 'lesson',
      objectId: lesson.id,
      summary: 'Transcript removed',
      payload: { segmentCount: 0 },
    });
  });
  return ok(next);
}

export async function listTranscript(lessonId: string): Promise<TranscriptSegment[]> {
  const segments = await getDb().transcriptSegments.where('lessonId').equals(lessonId).toArray();
  return segments.sort((a, b) => a.index - b.index);
}

export const recordObservationInput = z.object({
  lessonId: z.string().min(1),
  timestampSeconds: z.number().min(0).max(24 * 3600),
  kind: z.enum(['spoken', 'visual', 'inferred']),
  text: z.string().trim().min(1).max(2000),
  transferability: z.enum(['transferable', 'source_specific', 'unknown']).default('unknown'),
  uncertainty: z.enum(['confident', 'uncertain', 'needs_review']).default('confident'),
});
export type RecordObservationInput = z.input<typeof recordObservationInput>;

export async function recordObservation(
  input: RecordObservationInput,
  actorType: 'human' | 'agent' = 'human',
): Promise<Result<Observation>> {
  const parsed = recordObservationInput.safeParse(input);
  if (!parsed.success) return invalid('Observation input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;

  const lesson = await getDb().lessons.get(data.lessonId);
  if (!lesson) return notFound('Lesson', data.lessonId);

  const now = isoNow();
  const observation: Observation = {
    id: newId('obs'),
    workspaceId: lesson.workspaceId,
    lessonId: lesson.id,
    timestampSeconds: data.timestampSeconds,
    kind: data.kind,
    text: data.text,
    transferability: data.transferability,
    uncertainty: data.uncertainty,
    evidenceId: null,
    createdAt: now,
    updatedAt: now,
    actorType,
  };

  await withWorkspaceTx(lesson.workspaceId, ['observations'], async (ctx) => {
    await ctx.db.observations.add(observation);
    ctx.emit({
      type: 'observation.recorded',
      actorType,
      objectType: 'observation',
      objectId: observation.id,
      summary: `${data.kind} observation at ${Math.round(data.timestampSeconds)}s: ${data.text.slice(0, 100)}`,
      payload: { kind: data.kind, timestampSeconds: data.timestampSeconds },
    });
  });
  return ok(observation);
}

export async function listObservations(lessonId: string): Promise<Observation[]> {
  const observations = await getDb().observations.where('lessonId').equals(lessonId).toArray();
  return observations.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

export async function deleteObservation(observationId: string): Promise<Result<{ deleted: string }>> {
  const db = getDb();
  const observation = await db.observations.get(observationId);
  if (!observation) return notFound('Observation', observationId);
  await db.observations.delete(observationId);
  return ok({ deleted: observationId });
}

export async function addCoverageCriterion(
  lessonId: string,
  criterion: Omit<CoverageCriterion, 'id' | 'satisfiedByObservationIds'>,
): Promise<Result<Lesson>> {
  const db = getDb();
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) return notFound('Lesson', lessonId);
  if (criterion.endSeconds < criterion.startSeconds) {
    return invalid('Criterion end must not be before its start');
  }
  const next: Lesson = {
    ...lesson,
    coverageCriteria: [
      ...lesson.coverageCriteria,
      { ...criterion, id: newId('seg'), satisfiedByObservationIds: [] },
    ],
    revision: lesson.revision + 1,
    updatedAt: isoNow(),
  };
  await db.lessons.put(next);
  return ok(next);
}

export async function lessonCoverage(lessonId: string): Promise<Result<CoverageReport>> {
  const lesson = await getDb().lessons.get(lessonId);
  if (!lesson) return notFound('Lesson', lessonId);
  const [segments, observations] = await Promise.all([listTranscript(lessonId), listObservations(lessonId)]);
  return ok(computeCoverage(lesson, segments, observations));
}
