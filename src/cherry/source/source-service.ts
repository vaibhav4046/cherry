import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { conflict, invalid, notFound, unsupported } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import { sha256Text } from '../core/hash.ts';
import { isYouTubeFamilyHost, parseYouTubeUrl } from '../watch/youtube-url.ts';
import { parseTranscript } from '../watch/transcript-parser.ts';
import type { Lesson, TranscriptSegment, TranscriptSource } from '../watch/watch-model.ts';
import type { SourceContentFormat, SourceFetchMethod, SourceKind, SourceRecord } from './source-model.ts';

const MAX_CONTENT = 2 * 1024 * 1024;
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid']);
const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\])$/i;
const humanTranscriptSourceSchema = z.enum(['user_text', 'user_upload', 'creator_authorized_captions', 'local_transcription']);
const sourceFetchFailureSchema = z.object({
  status: z.enum(['blocked', 'failed']),
  reason: z.string().trim().min(1),
});

export type HumanTranscriptSource = z.infer<typeof humanTranscriptSourceSchema>;
export type SourceFetchFailure = z.infer<typeof sourceFetchFailureSchema>;
export type CreateSourceFetchMethod = Exclude<SourceFetchMethod, 'scrapling_fetch'>;

export interface SourceFetchOutcomeInput {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  result?: { stdout?: string; stderr?: string };
}

export type SourceFetchOutcome =
  | { kind: 'pending' }
  | { kind: 'failure'; status: 'blocked' | 'failed'; reason: string }
  | { kind: 'fetched'; markdown: string; contentHash: string };

export interface CreateSourceInput {
  workspaceId: string;
  kind: SourceKind;
  title: string;
  creator?: string;
  url?: string;
  content?: string;
  contentFormat?: SourceContentFormat;
  fetchMethod?: CreateSourceFetchMethod;
  permissionAcknowledged?: boolean;
  permissionNote?: string;
}

export type UpdateSourcePatch = Partial<Pick<SourceRecord, 'title' | 'creator' | 'url' | 'status' | 'contentFormat' | 'contentHash' | 'permissionNote'>>;

const createSchema = z.object({
  workspaceId: z.string().min(1),
  kind: z.enum(['youtube', 'article', 'note', 'file']),
  title: z.string().trim().min(1).max(300),
  creator: z.string().trim().max(200).optional(),
  url: z.string().trim().max(2048).optional(),
  content: z.string().max(MAX_CONTENT).optional(),
  contentFormat: z.enum(['plain', 'markdown', 'json', 'srt', 'vtt']).optional(),
  fetchMethod: z.enum(['user_paste', 'upload', 'local_transcription']).optional(),
  permissionAcknowledged: z.boolean().default(false),
  permissionNote: z.string().trim().max(1000).optional(),
});

function normalizeUrl(raw: string): Result<string> {
  let value: URL;
  try {
    value = new URL(raw.trim());
  } catch {
    return invalid('Enter a valid http(s) URL');
  }
  if (value.protocol !== 'http:' && value.protocol !== 'https:') return invalid('Only http(s) source URLs are supported');
  if (value.username || value.password) return invalid('Source URLs cannot contain credentials');
  if (PRIVATE_HOST.test(value.hostname) || value.hostname.endsWith('.localhost')) return invalid('Private or localhost URLs are not allowed');
  value.hash = '';
  for (const key of [...value.searchParams.keys()]) if (TRACKING_PARAMS.has(key.toLowerCase())) value.searchParams.delete(key);
  value.hostname = value.hostname.toLowerCase();
  if ((value.protocol === 'https:' && value.port === '443') || (value.protocol === 'http:' && value.port === '80')) value.port = '';
  return ok(value.toString());
}

function urlDomain(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function isBlockedFetchDomain(url: string | null): string | null {
  if (!url) return 'A public URL is required for a page fetch';
  const domain = urlDomain(url) ?? '';
  if (isPrivateHost(domain)) return 'Private or loopback addresses cannot be fetched';
  if (isYouTubeFamilyHost(domain)) return 'YouTube stays official-player/transcript-only; Scrapling never fetches it';
  if (domain === 'linkedin.com' || domain.endsWith('.linkedin.com')) return 'LinkedIn fetching is disabled; paste or upload the text instead';
  return null;
}

function isPrivateHost(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') || value === '::1') return true;
  if (!/^\d+(?:\.\d+){3}$/.test(value)) return value.includes(':') && (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb'));
  const octets = value.split('.').map(Number);
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) || (octets[0] === 192 && octets[1] === 168) || octets[0] === 169 && octets[1] === 254;
}

function sourceEventPayload(source: SourceRecord): Record<string, string | null> {
  return { kind: source.kind, lessonId: source.lessonId, urlDomain: urlDomain(source.url), contentFormat: source.contentFormat, contentHash: source.contentHash };
}

function transcriptSourceForFetchMethod(fetchMethod: CreateSourceFetchMethod | undefined): TranscriptSource {
  if (fetchMethod === 'upload') return 'user_upload';
  if (fetchMethod === 'local_transcription') return 'local_transcription';
  return 'user_text';
}

function fetchMethodForHumanTranscript(source: HumanTranscriptSource): SourceFetchMethod {
  if (source === 'user_upload') return 'upload';
  if (source === 'local_transcription') return 'local_transcription';
  return 'user_paste';
}

async function duplicate(workspaceId: string, url: string | null, contentHash: string | null): Promise<SourceRecord | undefined> {
  const records = await getDb().sourceRecords.where('workspaceId').equals(workspaceId).toArray();
  return records.find((record) => (url && record.url === url) || (contentHash && record.contentHash === contentHash));
}

export async function createSource(input: CreateSourceInput, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
  if ((input as { fetchMethod?: unknown }).fetchMethod === 'scrapling_fetch') {
    return invalid('Scrapling results must be verified through runner completion before they are saved');
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid('Source input is invalid', { issues: parsed.error.issues });
  const data = parsed.data;
  const normalized = data.url ? normalizeUrl(data.url) : ok<string | null>(null);
  if (!normalized.ok) return normalized;
  const url = normalized.value;
  const content = data.content?.trim() || null;
  if ((data.kind === 'youtube' || data.kind === 'article' || data.kind === 'file') && !data.permissionAcknowledged) {
    return invalid('Acknowledge that you are permitted to use this source before saving it', { field: 'permissionAcknowledged' });
  }
  if (data.kind === 'youtube' && !url) return invalid('A YouTube lesson needs a URL');
  if (data.kind === 'file' && !content) return invalid('Select a text file before saving a file source');
  const parsedYouTube = data.kind === 'youtube' ? parseYouTubeUrl(url!) : null;
  if (parsedYouTube && !parsedYouTube.ok) return parsedYouTube as Result<SourceRecord>;
  const parsedContent = content ? parseTranscript(content) : null;
  if (parsedContent && !parsedContent.ok) return parsedContent as Result<SourceRecord>;
  const workspace = await getDb().workspaces.get(data.workspaceId);
  if (!workspace) return notFound('Workspace', data.workspaceId);
  const contentHash = content ? await sha256Text(content) : null;
  const existing = await duplicate(data.workspaceId, url, contentHash);
  if (existing) return conflict('This source already exists in the workspace', { existingSourceId: existing.id });

  const now = isoNow();
  const fetchMethod: CreateSourceFetchMethod | null = data.fetchMethod ?? (content ? (data.kind === 'file' ? 'upload' : 'user_paste') : null);
  const transcriptSource = transcriptSourceForFetchMethod(fetchMethod ?? undefined);
  const lesson: Lesson = {
    id: newId('ls'), workspaceId: data.workspaceId, missionId: null, title: data.title,
    videoId: parsedYouTube?.ok ? parsedYouTube.value.videoId : null,
    canonicalUrl: parsedYouTube?.ok ? parsedYouTube.value.canonicalUrl : null,
    creator: data.creator ?? null, kind: data.kind === 'youtube' ? 'youtube' : 'manual', durationSeconds: null,
    permissionAcknowledgedAt: data.permissionAcknowledged || data.kind === 'note' ? now : null,
    coverageCriteria: [], lastPositionSeconds: 0,
    transcriptSource: content ? transcriptSource : null, transcriptImportedAt: content ? now : null,
    revision: content ? 2 : 1, createdAt: now, updatedAt: now,
  };
  if (data.permissionNote) lesson.permissionNote = data.permissionNote;
  const source: SourceRecord = {
    id: newId('src'), workspaceId: data.workspaceId, lessonId: lesson.id, kind: data.kind,
    status: content ? 'ready' : 'saved', title: data.title, creator: data.creator ?? null, url,
    contentFormat: data.contentFormat ?? (content ? 'plain' : null), contentHash,
    fetchStatus: 'not_requested',
    fetchMethod,
    fetchedAt: null, fetchError: null,
    permissionAcknowledgedAt: data.permissionAcknowledged || data.kind === 'note' ? now : null,
    permissionNote: data.permissionNote ?? null, createdAt: now, updatedAt: now,
  };
  const segments: TranscriptSegment[] = parsedContent?.ok ? parsedContent.value.segments.map((segment) => ({
    id: newId('seg'), workspaceId: data.workspaceId, lessonId: lesson.id, index: segment.index,
    startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, text: segment.text, source: transcriptSource,
  })) : [];

  await withWorkspaceTx(data.workspaceId, ['lessons', 'sourceRecords', 'transcriptSegments'], async (ctx) => {
    await ctx.db.lessons.add(lesson);
    await ctx.db.sourceRecords.add(source);
    if (segments.length > 0) await ctx.db.transcriptSegments.bulkAdd(segments);
    ctx.emit({
      type: 'lesson.loaded', actorType, objectType: 'lesson', objectId: lesson.id,
      summary: `Lesson "${lesson.title}" loaded (${lesson.kind})`,
      payload: { kind: lesson.kind, videoId: lesson.videoId ?? null },
    });
    ctx.emit({ type: 'source.saved', actorType, objectType: 'source', objectId: source.id, summary: `Source "${source.title}" saved`, payload: sourceEventPayload(source) });
    if (content && parsedContent?.ok) {
      ctx.emit({
        type: 'lesson.transcript_imported', actorType, objectType: 'lesson', objectId: lesson.id,
        summary: `Transcript imported (${segments.length} segments, source: ${transcriptSource})`,
        payload: { segmentCount: segments.length, source: transcriptSource, format: parsedContent.value.format, contentHash, sourceId: source.id, acquisition: transcriptSource, mode: 'replace' },
      });
    }
  });
  return ok(source);
}

export async function getSource(sourceId: string): Promise<SourceRecord | undefined> { return getDb().sourceRecords.get(sourceId); }

export async function listSources(workspaceId: string, options?: { includeArchived?: boolean }): Promise<SourceRecord[]> {
  const rows = await getDb().sourceRecords.where('workspaceId').equals(workspaceId).toArray();
  return rows.filter((row) => options?.includeArchived || row.status !== 'archived').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findDuplicateSource(workspaceId: string, input: { url?: string; contentHash?: string }): Promise<SourceRecord | undefined> {
  const url = input.url ? normalizeUrl(input.url) : ok<string | null>(null);
  return duplicate(workspaceId, url.ok ? url.value : null, input.contentHash ?? null);
}

export async function updateSource(sourceId: string, patch: UpdateSourcePatch, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
  const db = getDb(); const current = await db.sourceRecords.get(sourceId);
  if (!current) return notFound('Source', sourceId);
  let url = current.url;
  if (patch.url !== undefined) {
    if (patch.url === null) url = null;
    else { const normalized = normalizeUrl(patch.url); if (!normalized.ok) return normalized; url = normalized.value; }
  }
  const hash = patch.contentHash ?? current.contentHash;
  const existing = await duplicate(current.workspaceId, url, hash);
  if (existing && existing.id !== sourceId) return conflict('This source already exists in the workspace', { existingSourceId: existing.id });
  const next: SourceRecord = { ...current, ...patch, url, contentHash: hash, updatedAt: isoNow() };
  await withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.updated', actorType, objectType: 'source', objectId: sourceId, summary: `Source "${next.title}" updated`, payload: sourceEventPayload(next) });
  });
  return ok(next);
}

export async function archiveSource(sourceId: string, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  return withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId);
    if (!anchor) return notFound('Source', sourceId);
    const next: SourceRecord = { ...anchor, status: 'archived', updatedAt: isoNow() };
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.updated', actorType, objectType: 'source', objectId: sourceId, summary: `Source "${next.title}" updated`, payload: sourceEventPayload(next) });
    return ok(next);
  });
}

export async function requestSourceFetch(sourceId: string, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  return withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId);
    if (!anchor) return notFound('Source', sourceId);
    if (anchor.status === 'archived') return conflict('Archived sources cannot be fetched');
    const blocked = isBlockedFetchDomain(anchor.url);
    if (blocked) return unsupported(blocked, { sourceId });
    const next: SourceRecord = { ...anchor, fetchStatus: 'queued', fetchError: null, updatedAt: isoNow() };
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.fetch_requested', actorType, objectType: 'source', objectId: sourceId, summary: `Fetch requested for ${urlDomain(anchor.url) ?? 'source'}`, payload: sourceEventPayload(next) });
    return ok(next);
  });
}

export async function interpretSourceFetchOutcome(input: SourceFetchOutcomeInput): Promise<SourceFetchOutcome> {
  if (input.status === 'queued' || input.status === 'running') return { kind: 'pending' };
  if (input.status === 'timed_out') {
    return { kind: 'failure', status: 'failed', reason: 'The local fetch timed out after 30 seconds.' };
  }
  if (input.status === 'failed' || input.status === 'cancelled') {
    const reason = input.result?.stderr?.trim() || `The local fetch was ${input.status}.`;
    return { kind: 'failure', status: 'failed', reason };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.result?.stdout ?? '');
  } catch {
    return { kind: 'failure', status: 'failed', reason: 'The local fetch returned malformed JSON.' };
  }
  if (!payload || typeof payload !== 'object') {
    return { kind: 'failure', status: 'failed', reason: 'The local fetch returned no readable page.' };
  }
  const result = payload as { status?: unknown; markdown?: unknown; contentHash?: unknown; reason?: unknown };
  const reason = typeof result.reason === 'string' && result.reason.trim() ? result.reason.trim() : null;
  if (result.status === 'blocked') {
    return { kind: 'failure', status: 'blocked', reason: reason ?? 'The local fetch was blocked.' };
  }
  if (result.status !== 'fetched' || typeof result.markdown !== 'string' || !result.markdown.trim() || typeof result.contentHash !== 'string') {
    return { kind: 'failure', status: 'failed', reason: reason ?? 'The local fetch returned no readable page.' };
  }
  const contentHash = result.contentHash.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contentHash) || await sha256Text(result.markdown) !== contentHash) {
    return { kind: 'failure', status: 'failed', reason: 'The local fetch content hash did not match its Markdown.' };
  }
  return { kind: 'fetched', markdown: result.markdown, contentHash };
}

export async function completeSourceFetch(sourceId: string, input: { markdown: string; contentHash: string }, actorType: ActorType = 'runner'): Promise<Result<SourceRecord>> {
  if (!input.markdown.trim() || input.markdown.length > MAX_CONTENT) return invalid('Fetched content is empty or exceeds the 2 MiB limit');
  if (!/^[a-f0-9]{64}$/i.test(input.contentHash) || await sha256Text(input.markdown) !== input.contentHash.toLowerCase()) return invalid('Fetched content hash does not match the returned Markdown');
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  if (current.status === 'archived') return conflict('Archived sources cannot be fetched');
  if (current.fetchStatus !== 'queued') return conflict('Source fetch is not queued');
  const parsed = parseTranscript(input.markdown);
  if (!parsed.ok) return parsed as Result<SourceRecord>;
  const contentHash = input.contentHash.toLowerCase();

  return withWorkspaceTx(current.workspaceId, ['sourceRecords', 'lessons', 'transcriptSegments'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId);
    if (!anchor) return notFound('Source', sourceId);
    if (anchor.status === 'archived') return conflict('Archived sources cannot be fetched');
    if (anchor.fetchStatus !== 'queued') return conflict('Source fetch is not queued');
    const lesson = await ctx.db.lessons.get(anchor.lessonId);
    if (!lesson) return notFound('Lesson', anchor.lessonId);
    const now = isoNow();
    const segments: TranscriptSegment[] = parsed.value.segments.map((segment) => ({
      id: newId('seg'), workspaceId: lesson.workspaceId, lessonId: lesson.id, index: segment.index,
      startSeconds: segment.startSeconds, endSeconds: segment.endSeconds, text: segment.text, source: 'runner_fetch',
    }));
    const nextLesson: Lesson = { ...lesson, transcriptSource: 'runner_fetch', transcriptImportedAt: now, revision: lesson.revision + 1, updatedAt: now };
    const next: SourceRecord = { ...anchor, status: 'ready', contentFormat: 'markdown', contentHash, fetchStatus: 'fetched', fetchMethod: 'scrapling_fetch', fetchedAt: now, fetchError: null, updatedAt: now };

    await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).delete();
    await ctx.db.transcriptSegments.bulkAdd(segments);
    await ctx.db.lessons.put(nextLesson);
    await ctx.db.sourceRecords.put(next);
    ctx.emit({
      type: 'lesson.transcript_imported', actorType, objectType: 'lesson', objectId: lesson.id,
      summary: `Transcript imported (${segments.length} segments, source: runner_fetch)`,
      payload: { segmentCount: segments.length, source: 'runner_fetch', format: parsed.value.format, contentHash, sourceId, acquisition: 'runner_fetch', mode: 'replace' },
    });
    ctx.emit({ type: 'source.fetch_completed', actorType, objectType: 'source', objectId: sourceId, summary: `Fetched page from ${urlDomain(anchor.url) ?? 'public source'}`, payload: sourceEventPayload(next) });
    return ok(next);
  });
}

/** Atomically imports the first URL transcript and its SourceRecord metadata. */
export async function importSourceTranscript(
  sourceId: string,
  content: string,
  transcriptSource: HumanTranscriptSource,
  fileName?: string,
  actorType: ActorType = 'human',
  mode: 'replace' | 'append' = 'replace',
): Promise<Result<{ source: SourceRecord; segmentCount: number; totalSegments: number }>> {
  const parsedSource = humanTranscriptSourceSchema.safeParse(transcriptSource);
  if (!parsedSource.success) return invalid('Human transcript imports must use pasted, uploaded, creator-authorized, or local transcription sources');
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  const parsed = parseTranscript(content, fileName);
  if (!parsed.ok) return parsed as Result<{ source: SourceRecord; segmentCount: number; totalSegments: number }>;
  const contentHash = await sha256Text(content.trim());
  const now = isoNow();
  let outcome: { source: SourceRecord; segmentCount: number; totalSegments: number } | null = null;
  await withWorkspaceTx(current.workspaceId, ['sourceRecords', 'lessons', 'transcriptSegments'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId); if (!anchor) throw new Error('Source disappeared while importing transcript');
    const lesson = await ctx.db.lessons.get(anchor.lessonId); if (!lesson) throw new Error('Lesson disappeared while importing transcript');
    const existing = mode === 'append' ? await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).toArray() : [];
    const existingEnd = existing.reduce((max, segment) => Math.max(max, segment.endSeconds), 0);
    const firstStart = parsed.value.segments[0]?.startSeconds ?? 0;
    const offset = mode === 'append' && firstStart < existingEnd ? existingEnd + 2 : 0;
    const segments: TranscriptSegment[] = parsed.value.segments.map((segment) => ({ id: newId('seg'), workspaceId: lesson.workspaceId, lessonId: lesson.id, index: existing.length + segment.index, startSeconds: segment.startSeconds + offset, endSeconds: segment.endSeconds + offset, text: segment.text, source: parsedSource.data }));
    const nextLesson: Lesson = { ...lesson, transcriptSource: parsedSource.data, transcriptImportedAt: now, revision: lesson.revision + 1, updatedAt: now };
    const nextSource: SourceRecord = { ...anchor, status: 'ready', contentFormat: parsed.value.format, contentHash, fetchMethod: fetchMethodForHumanTranscript(parsedSource.data), fetchStatus: 'not_requested', fetchError: null, updatedAt: now };
    if (mode === 'replace') await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).delete();
    await ctx.db.transcriptSegments.bulkAdd(segments);
    await ctx.db.lessons.put(nextLesson);
    if (mode === 'replace') {
      await ctx.db.sourceRecords.put(nextSource);
      ctx.emit({ type: 'source.updated', actorType, objectType: 'source', objectId: sourceId, summary: `Transcript saved for "${nextSource.title}"`, payload: sourceEventPayload(nextSource) });
    }
    ctx.emit({ type: 'lesson.transcript_imported', actorType, objectType: 'lesson', objectId: lesson.id, summary: `Transcript ${mode === 'append' ? 'source added' : 'imported'} (${segments.length} segments, source: ${parsedSource.data})`, payload: { segmentCount: segments.length, source: parsedSource.data, format: parsed.value.format, contentHash, sourceId, acquisition: parsedSource.data, mode } });
    outcome = { source: mode === 'append' ? anchor : nextSource, segmentCount: segments.length, totalSegments: existing.length + segments.length };
  });
  return ok(outcome!);
}

export async function failSourceFetch(sourceId: string, failure: SourceFetchFailure, actorType: ActorType = 'runner'): Promise<Result<SourceRecord>> {
  const parsed = sourceFetchFailureSchema.safeParse(failure);
  if (!parsed.success) return invalid('Source fetch failure must include an explicit blocked or failed status and reason');
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  return withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId);
    if (!anchor) return notFound('Source', sourceId);
    if (anchor.fetchStatus !== 'queued') return conflict('Source fetch is no longer queued');
    const next: SourceRecord = { ...anchor, fetchStatus: parsed.data.status, fetchError: parsed.data.reason.slice(0, 400), updatedAt: isoNow() };
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.fetch_failed', actorType, objectType: 'source', objectId: sourceId, summary: `Source fetch ${next.fetchStatus}`, payload: sourceEventPayload(next) });
    return ok(next);
  });
}

export { normalizeUrl };
