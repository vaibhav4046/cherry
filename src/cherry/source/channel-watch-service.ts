import { z } from 'zod';
import type { ActorType } from '../core/domain-event.ts';
import { isoNow } from '../core/clock.ts';
import { approvalRequired, conflict, invalid, notFound } from '../core/errors.ts';
import { sha256Canonical } from '../core/hash.ts';
import { newId } from '../core/ids.ts';
import { ok, type Result } from '../core/result.ts';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { parseYouTubeUrl } from '../watch/youtube-url.ts';
import type { Lesson } from '../watch/watch-model.ts';
import type {
  ChannelWatch,
  ChannelWatchReconcileResult,
  ChannelWatchRunnerOutcome,
  ChannelWatchSchedule,
} from './channel-watch-model.ts';
import {
  CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT,
  CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT,
} from './channel-watch-model.ts';
import type { SourceRecord } from './source-model.ts';
import { parseYouTubeChannelId } from './youtube-channel-id.ts';

const MAX_FEED_ENTRIES = 15;
const MAX_ERROR_CHARACTERS = 1_000;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const boundedId = z.string().min(1).max(160).regex(ID_PATTERN);
const timestamp = z.string().max(64).refine((value) => {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}, 'must be an ISO timestamp');
const entrySchema = z.object({
  videoId: z.string().regex(VIDEO_ID_PATTERN),
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().min(1).max(2048),
  publishedAt: timestamp,
}).strict().superRefine((entry, ctx) => {
  const parsed = parseYouTubeUrl(entry.url);
  if (!parsed.ok || parsed.value.videoId !== entry.videoId || parsed.value.canonicalUrl !== entry.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'entry URL must be the canonical URL for its video id', path: ['url'] });
  }
});
const bindingShape = {
  schemaVersion: z.literal(1),
  jobId: boundedId,
  watchId: boundedId,
  actionHash: z.string().regex(HASH_PATTERN),
  channelId: z.string().regex(CHANNEL_ID_PATTERN),
};
const completedOutcomeSchema = z.object({
  ...bindingShape,
  status: z.literal('completed'),
  checkedAt: timestamp,
  channelName: z.string().trim().min(1).max(200),
  feedHash: z.string().regex(HASH_PATTERN),
  entries: z.array(entrySchema).max(MAX_FEED_ENTRIES),
}).strict().superRefine((outcome, ctx) => {
  const seen = new Set<string>();
  for (const [index, entry] of outcome.entries.entries()) {
    if (seen.has(entry.videoId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feed entries must have unique video ids', path: ['entries', index, 'videoId'] });
    }
    seen.add(entry.videoId);
    if (Date.parse(entry.publishedAt) > Date.parse(outcome.checkedAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'entry publication cannot be after the check', path: ['entries', index, 'publishedAt'] });
    }
  }
});
const failedOutcomeSchema = z.object({
  ...bindingShape,
  status: z.literal('failed'),
  error: z.string().trim().min(1).max(MAX_ERROR_CHARACTERS),
}).strict();
const runnerOutcomeSchema = z.union([completedOutcomeSchema, failedOutcomeSchema]);

export interface CreateChannelWatchInput {
  sourceId: string;
  channelId?: string;
}

export function channelWatchActionPayload(watch: Pick<ChannelWatch, 'channelId' | 'revision' | 'schedule' | 'sourceId' | 'workspaceId'>) {
  return {
    channelId: watch.channelId,
    revision: watch.revision,
    schedule: watch.schedule,
    sourceId: watch.sourceId,
    workspaceId: watch.workspaceId,
  };
}

export function computeChannelWatchActionHash(
  watch: Pick<ChannelWatch, 'channelId' | 'revision' | 'schedule' | 'sourceId' | 'workspaceId'>,
): Promise<string> {
  return sha256Canonical(channelWatchActionPayload(watch));
}

export async function getChannelWatch(watchId: string): Promise<ChannelWatch | undefined> {
  return getDb().channelWatches.get(watchId);
}

export async function listChannelWatches(workspaceId: string): Promise<ChannelWatch[]> {
  const watches = await getDb().channelWatches.where('workspaceId').equals(workspaceId).toArray();
  return watches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sameDefinition(left: ChannelWatch, right: ChannelWatch): boolean {
  return left.revision === right.revision && left.actionHash === right.actionHash && left.enabled === right.enabled;
}

function sameBinding(
  watch: ChannelWatch,
  binding: Pick<ChannelWatch, 'workspaceId' | 'sourceId' | 'revision' | 'actionHash'>,
): boolean {
  return watch.workspaceId === binding.workspaceId
    && watch.sourceId === binding.sourceId
    && watch.revision === binding.revision
    && watch.actionHash === binding.actionHash;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Detects a reconciliation that landed after a mutation's initial read. */
function sameStoredWatch(left: ChannelWatch, right: ChannelWatch): boolean {
  return sameDefinition(left, right)
    && left.updatedAt === right.updatedAt
    && left.channelName === right.channelName
    && left.lastProcessedRunnerJobId === right.lastProcessedRunnerJobId
    && left.lastAttemptedAt === right.lastAttemptedAt
    && left.lastCheckedAt === right.lastCheckedAt
    && left.lastError === right.lastError
    && left.lastFeedHash === right.lastFeedHash
    && left.disabledAt === right.disabledAt
    && sameValues(left.seenVideoIds, right.seenVideoIds)
    && sameValues(left.processedRunnerJobIds, right.processedRunnerJobIds);
}

function appendBoundedUnique(
  existing: readonly string[],
  incoming: readonly string[],
  limit: number,
): string[] {
  const incomingUnique = [...new Set(incoming)];
  const refreshed = new Set(incomingUnique);
  const ordered = [...new Set(existing)].filter((value) => !refreshed.has(value));
  ordered.push(...incomingUnique);
  return ordered.slice(-limit);
}

export async function createChannelWatch(
  input: CreateChannelWatchInput,
  actorType: ActorType = 'human',
): Promise<Result<ChannelWatch>> {
  if (actorType !== 'human') return approvalRequired('Only a person can watch a channel');
  const source = await getDb().sourceRecords.get(input.sourceId);
  if (!source) return notFound('Source', input.sourceId);
  if (source.kind !== 'youtube') return invalid('Only a YouTube source can start a channel watch');
  if (source.status === 'archived') return conflict('Archived sources cannot watch a channel');

  const rawChannelId = input.channelId ?? source.youtubeChannelId;
  if (!rawChannelId) return invalid('Paste the channel ID from its official /channel/ URL');
  const parsedChannel = parseYouTubeChannelId(rawChannelId);
  if (!parsedChannel.ok) return parsedChannel as Result<ChannelWatch>;
  const channelId = parsedChannel.value.channelId;
  if (source.youtubeChannelId && source.youtubeChannelId !== channelId) {
    return conflict('That channel ID does not match the channel already saved on this source');
  }

  const existing = await getDb().channelWatches.get(source.id);
  if (existing?.enabled) return conflict('This source is already watching its channel');
  const channelWatch = await getDb().channelWatches
    .where('[workspaceId+channelId]')
    .equals([source.workspaceId, channelId])
    .first();
  if (channelWatch && channelWatch.id !== source.id) {
    return conflict('This channel is already watched in the workspace', { watchId: channelWatch.id });
  }

  const now = isoNow();
  const revision = existing ? existing.revision + 1 : 1;
  const schedule: ChannelWatchSchedule = { kind: 'interval', everyMinutes: 1440, startAt: now };
  const draft: ChannelWatch = existing ? {
    ...existing,
    channelId,
    channelName: source.creator,
    enabled: true,
    schedule,
    revision,
    actionHash: '',
    seenVideoIds: appendBoundedUnique(existing.seenVideoIds, [], CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT),
    processedRunnerJobIds: appendBoundedUnique(existing.processedRunnerJobIds, [], CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT),
    disabledAt: null,
    lastError: null,
    updatedAt: now,
  } : {
    id: source.id,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    channelId,
    channelName: source.creator,
    enabled: true,
    schedule,
    revision,
    actionHash: '',
    seenVideoIds: [],
    processedRunnerJobIds: [],
    lastProcessedRunnerJobId: null,
    lastAttemptedAt: null,
    lastCheckedAt: null,
    lastError: null,
    lastFeedHash: null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  draft.actionHash = await computeChannelWatchActionHash(draft);

  return withWorkspaceTx(source.workspaceId, ['sourceRecords', 'channelWatches'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(source.id);
    if (!anchor || anchor.workspaceId !== source.workspaceId) return notFound('Source', source.id);
    if (anchor.kind !== 'youtube') return invalid('Only a YouTube source can start a channel watch');
    if (anchor.status === 'archived') return conflict('Archived sources cannot watch a channel');
    const current = await ctx.db.channelWatches.get(source.id);
    if (existing ? !current || !sameStoredWatch(current, existing) : current) {
      return conflict('The channel watch changed while it was being saved; try again');
    }
    const duplicate = await ctx.db.channelWatches
      .where('[workspaceId+channelId]')
      .equals([source.workspaceId, channelId])
      .first();
    if (duplicate && duplicate.id !== source.id) return conflict('This channel is already watched in the workspace', { watchId: duplicate.id });

    if (anchor.youtubeChannelId !== channelId) {
      const nextSource: SourceRecord = { ...anchor, youtubeChannelId: channelId, updatedAt: now };
      await ctx.db.sourceRecords.put(nextSource);
      ctx.emit({
        type: 'source.updated', actorType: 'human', objectType: 'source', objectId: source.id,
        summary: `Source "${nextSource.title}" updated`,
        payload: { kind: nextSource.kind, lessonId: nextSource.lessonId, youtubeChannelId: channelId, sourceOrigin: nextSource.sourceOrigin ?? 'manual' },
      });
    }
    await ctx.db.channelWatches.put(draft);
    ctx.emit({
      type: 'channel_watch.created', actorType: 'human', objectType: 'channel_watch', objectId: draft.id,
      summary: `${existing ? 'Channel watch reactivated' : 'Channel watch created'} for ${channelId}`,
      payload: {
        channelId, sourceId: source.id, revision: draft.revision, actionHash: draft.actionHash,
        schedule: { kind: draft.schedule.kind, everyMinutes: draft.schedule.everyMinutes, startAt: draft.schedule.startAt },
      },
    });
    return ok(draft);
  });
}

export async function disableChannelWatch(
  watchId: string,
  actorType: ActorType = 'human',
  expectedBinding?: Pick<ChannelWatch, 'workspaceId' | 'sourceId' | 'revision' | 'actionHash'>,
): Promise<Result<ChannelWatch>> {
  if (actorType !== 'human') return approvalRequired('Only a person can stop a channel watch');
  const current = await getDb().channelWatches.get(watchId);
  if (!current) return notFound('Channel watch', watchId);
  if (expectedBinding && !sameBinding(current, expectedBinding)) {
    return conflict('The channel watch changed before it could be stopped; refresh and try again');
  }
  if (!current.enabled) return ok(current);
  const now = isoNow();
  const next: ChannelWatch = {
    ...current,
    enabled: false,
    disabledAt: now,
    revision: current.revision + 1,
    actionHash: '',
    seenVideoIds: appendBoundedUnique(current.seenVideoIds, [], CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT),
    processedRunnerJobIds: appendBoundedUnique(current.processedRunnerJobIds, [], CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT),
    updatedAt: now,
  };
  next.actionHash = await computeChannelWatchActionHash(next);

  return withWorkspaceTx(current.workspaceId, ['channelWatches'], async (ctx) => {
    const anchor = await ctx.db.channelWatches.get(watchId);
    if (!anchor) return notFound('Channel watch', watchId);
    if (!sameStoredWatch(anchor, current)) return conflict('The channel watch changed while it was being stopped; try again');
    await ctx.db.channelWatches.put(next);
    ctx.emit({
      type: 'channel_watch.disabled', actorType: 'human', objectType: 'channel_watch', objectId: watchId,
      summary: `Channel watch stopped for ${next.channelId}`,
      payload: { channelId: next.channelId, sourceId: next.sourceId, revision: next.revision, actionHash: next.actionHash },
    });
    return ok(next);
  });
}

function emptyReconcile(watch: ChannelWatch, replayed = false): ChannelWatchReconcileResult {
  return { watch, createdSources: [], skippedBeforeWatch: 0, duplicateCount: 0, replayed };
}

async function recordFailedAttempt(
  current: ChannelWatch,
  error: string,
  jobId?: string,
): Promise<Result<ChannelWatchReconcileResult>> {
  const now = isoNow();
  return withWorkspaceTx(current.workspaceId, ['channelWatches'], async (ctx) => {
    const anchor = await ctx.db.channelWatches.get(current.id);
    if (!anchor) return notFound('Channel watch', current.id);
    if (!anchor.enabled) return conflict('This channel watch is stopped');
    if (jobId && anchor.processedRunnerJobIds.includes(jobId)) return ok(emptyReconcile(anchor, true));
    if (!sameStoredWatch(anchor, current)) return conflict('The channel watch changed while the runner result was being saved; try again');
    const processedRunnerJobIds = appendBoundedUnique(
      anchor.processedRunnerJobIds,
      jobId ? [jobId] : [],
      CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT,
    );
    const next: ChannelWatch = {
      ...anchor,
      seenVideoIds: appendBoundedUnique(anchor.seenVideoIds, [], CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT),
      processedRunnerJobIds,
      lastProcessedRunnerJobId: jobId ?? anchor.lastProcessedRunnerJobId,
      lastAttemptedAt: now,
      lastError: error.slice(0, MAX_ERROR_CHARACTERS),
      updatedAt: now,
    };
    await ctx.db.channelWatches.put(next);
    ctx.emit({
      type: 'channel_watch.failed', actorType: 'runner', objectType: 'channel_watch', objectId: next.id,
      summary: `Channel watch check failed for ${next.channelId}`,
      payload: { channelId: next.channelId, sourceId: next.sourceId, jobId: jobId ?? null },
    });
    return ok(emptyReconcile(next));
  });
}

function bindingMatches(watch: ChannelWatch, outcome: ChannelWatchRunnerOutcome): boolean {
  return outcome.watchId === watch.id
    && outcome.channelId === watch.channelId
    && outcome.actionHash === watch.actionHash;
}

function boundedJobId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const jobId = (value as Record<string, unknown>)['jobId'];
  return typeof jobId === 'string' && jobId.length <= 160 && ID_PATTERN.test(jobId) ? jobId : undefined;
}

function sourceProofPayload(source: SourceRecord) {
  return {
    kind: source.kind,
    lessonId: source.lessonId,
    youtubeChannelId: source.youtubeChannelId ?? null,
    sourceOrigin: source.sourceOrigin ?? 'manual',
    urlDomain: 'www.youtube.com',
    contentFormat: null,
    contentHash: null,
  };
}

export async function reconcileChannelWatchRunnerOutcome(
  watchId: string,
  rawOutcome: unknown,
): Promise<Result<ChannelWatchReconcileResult>> {
  const current = await getDb().channelWatches.get(watchId);
  if (!current) return notFound('Channel watch', watchId);
  if (!current.enabled) return conflict('This channel watch is stopped');

  const parsed = runnerOutcomeSchema.safeParse(rawOutcome);
  if (!parsed.success) {
    await recordFailedAttempt(current, 'The runner result did not match the channel-watch schema.', boundedJobId(rawOutcome));
    return invalid('The runner result did not match the channel-watch schema');
  }
  const outcome = parsed.data as ChannelWatchRunnerOutcome;
  if (!bindingMatches(current, outcome)) {
    await recordFailedAttempt(current, 'The runner result did not match this channel watch.', outcome.jobId);
    return invalid('The runner result did not match this channel watch');
  }
  if (current.processedRunnerJobIds.includes(outcome.jobId)) return ok(emptyReconcile(current, true));
  if (outcome.status === 'failed') return recordFailedAttempt(current, outcome.error, outcome.jobId);
  if (Date.parse(outcome.checkedAt) < Date.parse(current.schedule.startAt)) {
    await recordFailedAttempt(current, 'The runner check predates this channel watch.', outcome.jobId);
    return invalid('The runner check predates this channel watch');
  }

  const mutationNow = isoNow();
  return withWorkspaceTx(current.workspaceId, ['channelWatches', 'sourceRecords', 'lessons'], async (ctx) => {
    const watch = await ctx.db.channelWatches.get(watchId);
    if (!watch) return notFound('Channel watch', watchId);
    if (!watch.enabled) return conflict('This channel watch is stopped');
    if (!bindingMatches(watch, outcome)) return invalid('The runner result no longer matches this channel watch');
    if (watch.processedRunnerJobIds.includes(outcome.jobId)) return ok(emptyReconcile(watch, true));
    if (!sameStoredWatch(watch, current)) return conflict('The channel watch changed while the runner result was being saved; try again');
    const anchor = await ctx.db.sourceRecords.get(watch.sourceId);
    if (!anchor || anchor.workspaceId !== watch.workspaceId || anchor.kind !== 'youtube' || anchor.status === 'archived') {
      return conflict('The watched source is no longer active');
    }

    const existingSources = await ctx.db.sourceRecords.where('workspaceId').equals(watch.workspaceId).toArray();
    const existingVideoIds = new Set(existingSources.map((source) => {
      if (source.kind !== 'youtube' || !source.url) return null;
      const parsedUrl = parseYouTubeUrl(source.url);
      return parsedUrl.ok ? parsedUrl.value.videoId : null;
    }).filter((value): value is string => value !== null));
    const seenBefore = new Set(watch.seenVideoIds);
    const lessons: Lesson[] = [];
    const sources: SourceRecord[] = [];
    let skippedBeforeWatch = 0;
    let duplicateCount = 0;

    for (const entry of outcome.entries) {
      if (Date.parse(entry.publishedAt) <= Date.parse(watch.schedule.startAt)) {
        skippedBeforeWatch += 1;
        continue;
      }
      if (seenBefore.has(entry.videoId) || existingVideoIds.has(entry.videoId)) {
        duplicateCount += 1;
        continue;
      }
      const lessonId = newId('ls');
      const sourceId = newId('src');
      const lesson: Lesson = {
        id: lessonId,
        workspaceId: watch.workspaceId,
        missionId: null,
        title: entry.title,
        videoId: entry.videoId,
        canonicalUrl: entry.url,
        creator: outcome.channelName,
        kind: 'youtube',
        durationSeconds: null,
        permissionAcknowledgedAt: watch.schedule.startAt,
        permissionNote: 'Saved from a human-created public channel watch.',
        coverageCriteria: [],
        lastPositionSeconds: 0,
        transcriptSource: null,
        transcriptImportedAt: null,
        revision: 1,
        createdAt: mutationNow,
        updatedAt: mutationNow,
      };
      const source: SourceRecord = {
        id: sourceId,
        workspaceId: watch.workspaceId,
        lessonId,
        kind: 'youtube',
        status: 'saved',
        title: entry.title,
        creator: outcome.channelName,
        url: entry.url,
        youtubeChannelId: watch.channelId,
        contentFormat: null,
        contentHash: null,
        fetchStatus: 'not_requested',
        fetchMethod: null,
        fetchedAt: null,
        fetchError: null,
        sourceOrigin: 'rss-watch',
        permissionAcknowledgedAt: watch.schedule.startAt,
        permissionNote: 'Saved from a human-created public channel watch.',
        createdAt: mutationNow,
        updatedAt: mutationNow,
      };
      lessons.push(lesson);
      sources.push(source);
      existingVideoIds.add(entry.videoId);
    }

    if (lessons.length > 0) await ctx.db.lessons.bulkAdd(lessons);
    if (sources.length > 0) await ctx.db.sourceRecords.bulkAdd(sources);
    const isLatestAttempt = !watch.lastAttemptedAt || Date.parse(outcome.checkedAt) >= Date.parse(watch.lastAttemptedAt);
    const next: ChannelWatch = {
      ...watch,
      channelName: isLatestAttempt ? outcome.channelName : watch.channelName,
      seenVideoIds: appendBoundedUnique(
        watch.seenVideoIds,
        outcome.entries.map((entry) => entry.videoId),
        CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT,
      ),
      processedRunnerJobIds: appendBoundedUnique(
        watch.processedRunnerJobIds,
        [outcome.jobId],
        CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT,
      ),
      lastProcessedRunnerJobId: outcome.jobId,
      lastAttemptedAt: isLatestAttempt ? outcome.checkedAt : watch.lastAttemptedAt,
      lastCheckedAt: !watch.lastCheckedAt || Date.parse(outcome.checkedAt) >= Date.parse(watch.lastCheckedAt) ? outcome.checkedAt : watch.lastCheckedAt,
      lastError: isLatestAttempt ? null : watch.lastError,
      lastFeedHash: isLatestAttempt ? outcome.feedHash : watch.lastFeedHash,
      updatedAt: mutationNow,
    };
    await ctx.db.channelWatches.put(next);
    for (const [index, source] of sources.entries()) {
      const lesson = lessons[index]!;
      ctx.emit({
        type: 'lesson.loaded', actorType: 'runner', objectType: 'lesson', objectId: lesson.id,
        summary: `Lesson "${lesson.title}" loaded (youtube)`, payload: { kind: 'youtube', videoId: lesson.videoId ?? null },
      });
      ctx.emit({
        type: 'source.saved', actorType: 'runner', objectType: 'source', objectId: source.id,
        summary: `Source "${source.title}" saved`, payload: sourceProofPayload(source),
      });
    }
    ctx.emit({
      type: 'channel_watch.checked', actorType: 'runner', objectType: 'channel_watch', objectId: watch.id,
      summary: `Channel watch checked for ${watch.channelId}; ${sources.length} new sources saved`,
      payload: {
        channelId: watch.channelId,
        sourceId: watch.sourceId,
        jobId: outcome.jobId,
        checkedAt: outcome.checkedAt,
        feedHash: outcome.feedHash,
        feedEntries: outcome.entries.length,
        newSources: sources.length,
        createdSourceIds: sources.map((source) => source.id),
      },
    });
    return ok({ watch: next, createdSources: sources, skippedBeforeWatch, duplicateCount, replayed: false });
  });
}
