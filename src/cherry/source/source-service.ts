import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { conflict, invalid, notFound, unsupported } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import { sha256Text } from '../core/hash.ts';
import { importTranscript, loadLesson } from '../watch/lesson-service.ts';
import type { SourceContentFormat, SourceFetchMethod, SourceKind, SourceRecord } from './source-model.ts';

const MAX_CONTENT = 2 * 1024 * 1024;
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid']);
const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\])$/i;

export interface CreateSourceInput {
  workspaceId: string;
  kind: SourceKind;
  title: string;
  creator?: string;
  url?: string;
  content?: string;
  contentFormat?: SourceContentFormat;
  fetchMethod?: SourceFetchMethod;
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
  fetchMethod: z.enum(['user_paste', 'upload', 'scrapling_fetch']).optional(),
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
  if (domain === 'youtube.com' || domain.endsWith('.youtube.com') || domain === 'youtu.be') return 'YouTube stays official-player/transcript-only; Scrapling never fetches it';
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

async function duplicate(workspaceId: string, url: string | null, contentHash: string | null): Promise<SourceRecord | undefined> {
  const records = await getDb().sourceRecords.where('workspaceId').equals(workspaceId).toArray();
  return records.find((record) => (url && record.url === url) || (contentHash && record.contentHash === contentHash));
}

export async function createSource(input: CreateSourceInput, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
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
  if (data.kind === 'youtube' && url && !/youtube\.com|youtu\.be/i.test(new URL(url).hostname)) return invalid('YouTube lessons must use a YouTube URL');
  if (data.kind === 'file' && !content) return invalid('Select a text file before saving a file source');
  const contentHash = content ? await sha256Text(content) : null;
  const existing = await duplicate(data.workspaceId, url, contentHash);
  if (existing) return conflict('This source already exists in the workspace', { existingSourceId: existing.id });

  const lesson = await loadLesson({
    workspaceId: data.workspaceId,
    title: data.title,
    creator: data.creator,
    ...(url ? { url } : {}),
    kind: data.kind === 'youtube' ? 'youtube' : 'manual',
    permissionAcknowledged: data.kind === 'note' ? true : data.permissionAcknowledged,
    permissionNote: data.permissionNote,
  }, actorType);
  if (!lesson.ok) return lesson;
  const now = isoNow();
  const source: SourceRecord = {
    id: newId('src'), workspaceId: data.workspaceId, lessonId: lesson.value.id, kind: data.kind,
    status: content ? 'ready' : 'saved', title: data.title, creator: data.creator ?? null, url,
    contentFormat: data.contentFormat ?? (content ? 'plain' : null), contentHash,
    fetchStatus: data.fetchMethod === 'scrapling_fetch' ? 'fetched' : 'not_requested',
    fetchMethod: data.fetchMethod ?? (content ? (data.kind === 'file' ? 'upload' : 'user_paste') : null),
    fetchedAt: data.fetchMethod === 'scrapling_fetch' ? now : null, fetchError: null,
    permissionAcknowledgedAt: data.permissionAcknowledged || data.kind === 'note' ? now : null,
    permissionNote: data.permissionNote ?? null, createdAt: now, updatedAt: now,
  };
  await withWorkspaceTx(data.workspaceId, ['sourceRecords'], async (ctx) => {
    await ctx.db.sourceRecords.add(source);
    ctx.emit({ type: 'source.saved', actorType, objectType: 'source', objectId: source.id, summary: `Source "${source.title}" saved`, payload: sourceEventPayload(source) });
  });
  if (content) {
    const imported = await importTranscript(source.lessonId, content, data.fetchMethod === 'upload' ? 'user_upload' : 'user_text', undefined, actorType);
    if (!imported.ok) return imported as Result<SourceRecord>;
  }
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
  return updateSource(sourceId, { status: 'archived' }, actorType);
}

export async function requestSourceFetch(sourceId: string, actorType: ActorType = 'human'): Promise<Result<SourceRecord>> {
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  const blocked = isBlockedFetchDomain(current.url);
  if (blocked) return unsupported(blocked, { sourceId });
  const next: SourceRecord = { ...current, fetchStatus: 'queued', fetchError: null, updatedAt: isoNow() };
  await withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.fetch_requested', actorType, objectType: 'source', objectId: sourceId, summary: `Fetch requested for ${urlDomain(current.url) ?? 'source'}`, payload: sourceEventPayload(next) });
  });
  return ok(next);
}

export async function completeSourceFetch(sourceId: string, input: { markdown: string; contentHash: string }, actorType: ActorType = 'runner'): Promise<Result<SourceRecord>> {
  if (!input.markdown.trim() || input.markdown.length > MAX_CONTENT) return invalid('Fetched content is empty or exceeds the 2 MiB limit');
  if (!/^[a-f0-9]{64}$/i.test(input.contentHash) || await sha256Text(input.markdown) !== input.contentHash.toLowerCase()) return invalid('Fetched content hash does not match the returned Markdown');
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  if (current.fetchStatus !== 'queued') return conflict('Source fetch is not queued');
  const imported = await importTranscript(current.lessonId, input.markdown, 'user_text', undefined, actorType);
  if (!imported.ok) return imported as Result<SourceRecord>;
  const next: SourceRecord = { ...current, status: 'ready', contentFormat: 'markdown', contentHash: input.contentHash, fetchStatus: 'fetched', fetchMethod: 'scrapling_fetch', fetchedAt: isoNow(), fetchError: null, updatedAt: isoNow() };
  await withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.fetch_completed', actorType, objectType: 'source', objectId: sourceId, summary: `Fetched page from ${urlDomain(current.url) ?? 'public source'}`, payload: sourceEventPayload(next) });
  });
  return ok(next);
}

export async function failSourceFetch(sourceId: string, reason: string, actorType: ActorType = 'runner'): Promise<Result<SourceRecord>> {
  const current = await getSource(sourceId); if (!current) return notFound('Source', sourceId);
  const next: SourceRecord = { ...current, fetchStatus: reason.toLowerCase().includes('block') ? 'blocked' : 'failed', fetchError: reason.slice(0, 400), updatedAt: isoNow() };
  await withWorkspaceTx(current.workspaceId, ['sourceRecords'], async (ctx) => {
    await ctx.db.sourceRecords.put(next);
    ctx.emit({ type: 'source.fetch_failed', actorType, objectType: 'source', objectId: sourceId, summary: `Source fetch ${next.fetchStatus}`, payload: sourceEventPayload(next) });
  });
  return ok(next);
}

export { normalizeUrl };
