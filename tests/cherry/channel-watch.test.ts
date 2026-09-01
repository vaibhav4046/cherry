import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import { fixedClock, setClock } from '../../src/cherry/core/clock.ts';
import { sha256Canonical, sha256CanonicalExcluding } from '../../src/cherry/core/hash.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, deleteWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { exportWorkspace, importWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import {
  createChannelWatch,
  disableChannelWatch,
  getChannelWatch,
  listChannelWatches,
  reconcileChannelWatchRunnerOutcome,
} from '../../src/cherry/source/channel-watch-service.ts';
import { archiveSource, createSource, listSources } from '../../src/cherry/source/source-service.ts';
import { listTranscript } from '../../src/cherry/watch/lesson-service.ts';

const CHANNEL_ID = 'UCSTUDIONORTH12345678901';
const OTHER_CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';
const FEED_HASH = 'a'.repeat(64);
const CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT = 2_048;
const CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT = 512;

async function sourceFixture(channelId = CHANNEL_ID) {
  const workspace = unwrap(await createWorkspace({ name: 'Channel watches' }));
  const source = unwrap(await createSource({
    workspaceId: workspace.id,
    kind: 'youtube',
    title: 'Anchor video',
    creator: 'Studio North',
    url: 'https://www.youtube.com/watch?v=anchorVid01',
    youtubeChannelId: channelId,
    permissionAcknowledged: true,
  }));
  return { workspace, source };
}

function completedOutcome(
  watch: { id: string; actionHash: string; channelId: string; createdAt: string; schedule?: { startAt: string } },
  overrides: Record<string, unknown> = {},
) {
  const createdAt = Date.parse(watch.schedule?.startAt ?? watch.createdAt);
  return {
    schemaVersion: 1 as const,
    status: 'completed' as const,
    jobId: 'job-feed-1',
    watchId: watch.id,
    actionHash: watch.actionHash,
    channelId: watch.channelId,
    checkedAt: new Date(createdAt + 60_000).toISOString(),
    channelName: 'Studio North',
    feedHash: FEED_HASH,
    entries: [
      {
        videoId: 'oldVideo001',
        title: 'Already published',
        url: 'https://www.youtube.com/watch?v=oldVideo001',
        publishedAt: new Date(createdAt - 60_000).toISOString(),
      },
      {
        videoId: 'newVideo001',
        title: 'A new workflow',
        url: 'https://www.youtube.com/watch?v=newVideo001',
        publishedAt: new Date(createdAt + 30_000).toISOString(),
      },
    ],
    ...overrides,
  };
}

describe('channel watch domain', () => {
  beforeEach(() => {
    freshDb();
    setClock(fixedClock('2026-09-01T09:00:00.000Z'));
  });

  it('creates a human-only daily watch bound to the exact source and canonical action hash', async () => {
    const { workspace, source } = await sourceFixture();
    const denied = await createChannelWatch({ sourceId: source.id }, 'agent');
    expect(denied).toMatchObject({ ok: false, error: { code: 'approval_required' } });

    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    expect(watch).toMatchObject({
      id: source.id,
      sourceId: source.id,
      workspaceId: workspace.id,
      channelId: CHANNEL_ID,
      channelName: 'Studio North',
      enabled: true,
      revision: 1,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: watch.createdAt },
      seenVideoIds: [],
      processedRunnerJobIds: [],
      lastProcessedRunnerJobId: null,
      lastAttemptedAt: null,
      lastCheckedAt: null,
      lastError: null,
      lastFeedHash: null,
    });
    expect(watch.actionHash).toBe(await sha256Canonical({
      channelId: CHANNEL_ID,
      revision: 1,
      schedule: watch.schedule,
      sourceId: source.id,
      workspaceId: workspace.id,
    }));
  });

  it('requires an active YouTube source and enforces one source and channel watch per workspace', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const duplicate = await createChannelWatch({ sourceId: source.id });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'conflict' } });

    const second = unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'youtube',
      title: 'Same channel',
      url: 'https://www.youtube.com/watch?v=anchorVid02',
      youtubeChannelId: CHANNEL_ID,
      permissionAcknowledged: true,
    }));
    expect(await createChannelWatch({ sourceId: second.id })).toMatchObject({ ok: false, error: { code: 'conflict' } });

    const archived = unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'youtube',
      title: 'Archived',
      url: 'https://www.youtube.com/watch?v=anchorVid03',
      youtubeChannelId: OTHER_CHANNEL_ID,
      permissionAcknowledged: true,
    }));
    unwrap(await archiveSource(archived.id));
    expect(await createChannelWatch({ sourceId: archived.id })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await getChannelWatch(watch.id)).toEqual(watch);
  });

  it('accepts an explicit strict channel id for an existing source and persists it on the anchor', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Manual channel id' }));
    const source = unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'youtube',
      title: 'No channel metadata',
      url: 'https://www.youtube.com/watch?v=anchorVid04',
      permissionAcknowledged: true,
    }));
    const rejected = await createChannelWatch({ sourceId: source.id, channelId: '@StudioNorth' });
    expect(rejected.ok).toBe(false);

    const watch = unwrap(await createChannelWatch({
      sourceId: source.id,
      channelId: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    }));
    expect(watch.channelId).toBe(CHANNEL_ID);
    expect((await getDb().sourceRecords.get(source.id))?.youtubeChannelId).toBe(CHANNEL_ID);
  });

  it('requires a person to stop a watch before its anchor can be archived', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    expect(await disableChannelWatch(watch.id, 'agent')).toMatchObject({ ok: false, error: { code: 'approval_required' } });

    const proofBefore = await getDb().proofEvents.where('workspaceId').equals(workspace.id).toArray();
    const blocked = await archiveSource(source.id);
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: 'conflict', message: expect.stringMatching(/stop watching/i) },
    });
    expect(await getDb().sourceRecords.get(source.id)).toEqual(source);
    expect(await getChannelWatch(watch.id)).toEqual(watch);
    expect(await getDb().proofEvents.where('workspaceId').equals(workspace.id).toArray()).toEqual(proofBefore);

    const disabled = unwrap(await disableChannelWatch(watch.id));
    expect(disabled).toMatchObject({ enabled: false, revision: 2 });
    expect(unwrap(await archiveSource(source.id))).toMatchObject({ status: 'archived' });
    expect(await getChannelWatch(watch.id)).toEqual(disabled);
  });

  it('does not let stopping overwrite a reconciliation committed after its initial read', async () => {
    const { source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const table = getDb().channelWatches;
    const realGet = table.get.bind(table);
    const concurrentlyReconciled = {
      ...watch,
      processedRunnerJobIds: ['job-concurrent'],
      lastProcessedRunnerJobId: 'job-concurrent',
      lastAttemptedAt: '2026-09-01T09:01:00.000Z',
      lastCheckedAt: '2026-09-01T09:01:00.000Z',
      lastFeedHash: FEED_HASH,
    };
    let reads = 0;
    const concurrentRead = async (id: string) => {
      reads += 1;
      if (reads === 2) {
        await table.put(concurrentlyReconciled);
        return concurrentlyReconciled;
      }
      return realGet(id);
    };
    const read = vi.spyOn(table, 'get').mockImplementation(concurrentRead as unknown as typeof table.get);

    let stopped: Awaited<ReturnType<typeof disableChannelWatch>>;
    try {
      stopped = await disableChannelWatch(watch.id);
    } finally {
      read.mockRestore();
    }

    expect(stopped).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await getChannelWatch(watch.id)).toEqual(concurrentlyReconciled);
  });

  it('does not let a stale tab stop a newer watch revision', async () => {
    const { source } = await sourceFixture();
    const first = unwrap(await createChannelWatch({ sourceId: source.id }));
    setClock(fixedClock('2026-09-01T09:10:00.000Z'));
    unwrap(await disableChannelWatch(first.id, 'human', first));
    setClock(fixedClock('2026-09-01T09:20:00.000Z'));
    const current = unwrap(await createChannelWatch({ sourceId: source.id }));

    expect(current).toMatchObject({ enabled: true, revision: 3 });
    expect(await disableChannelWatch(first.id, 'human', first)).toMatchObject({
      ok: false,
      error: { code: 'conflict', message: expect.stringMatching(/changed/i) },
    });
    expect(await getChannelWatch(first.id)).toEqual(current);
  });

  it('uses the latest activation time as the no-backlog and permission boundary', async () => {
    const { source } = await sourceFixture();
    const first = unwrap(await createChannelWatch({ sourceId: source.id }));
    setClock(fixedClock('2026-09-01T09:10:00.000Z'));
    unwrap(await disableChannelWatch(first.id, 'human', first));
    setClock(fixedClock('2026-09-01T09:20:00.000Z'));
    const reactivated = unwrap(await createChannelWatch({ sourceId: source.id }));

    const outcome = completedOutcome(reactivated, {
      jobId: 'job-reactivated',
      entries: [
        {
          videoId: 'duringStop1',
          title: 'Published while stopped',
          url: 'https://www.youtube.com/watch?v=duringStop1',
          publishedAt: '2026-09-01T09:15:00.000Z',
        },
        {
          videoId: 'afterStart1',
          title: 'Published after reactivation',
          url: 'https://www.youtube.com/watch?v=afterStart1',
          publishedAt: '2026-09-01T09:20:30.000Z',
        },
      ],
    });
    const reconciled = unwrap(await reconcileChannelWatchRunnerOutcome(reactivated.id, outcome));

    expect(reconciled).toMatchObject({ skippedBeforeWatch: 1, duplicateCount: 0 });
    expect(reconciled.createdSources).toHaveLength(1);
    expect(reconciled.createdSources[0]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=afterStart1',
      permissionAcknowledgedAt: reactivated.schedule.startAt,
    });
  });

  it('atomically reconciles a bounded result into post-watch transcriptless drafts and records every feed id', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const outcome = completedOutcome(watch);
    const reconciled = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome));

    expect(reconciled).toMatchObject({ skippedBeforeWatch: 1, duplicateCount: 0, replayed: false });
    expect(reconciled.createdSources).toHaveLength(1);
    expect(reconciled.createdSources[0]).toMatchObject({
      kind: 'youtube',
      status: 'saved',
      sourceOrigin: 'rss-watch',
      youtubeChannelId: CHANNEL_ID,
      url: 'https://www.youtube.com/watch?v=newVideo001',
      contentHash: null,
      fetchMethod: null,
      fetchStatus: 'not_requested',
    });
    expect(await listTranscript(reconciled.createdSources[0]!.lessonId)).toEqual([]);
    expect(reconciled.watch).toMatchObject({
      seenVideoIds: ['oldVideo001', 'newVideo001'],
      processedRunnerJobIds: ['job-feed-1'],
      lastProcessedRunnerJobId: 'job-feed-1',
      lastAttemptedAt: outcome.checkedAt,
      lastCheckedAt: outcome.checkedAt,
      lastError: null,
      lastFeedHash: FEED_HASH,
    });
    expect(await listSources(workspace.id)).toHaveLength(2);
  });

  it('deduplicates existing URLs and makes a processed job replay a no-op', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const publishedAt = new Date(Date.parse(watch.createdAt) + 30_000).toISOString();
    unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'youtube',
      title: 'Already saved',
      url: 'https://www.youtube.com/watch?v=newVideo001',
      permissionAcknowledged: true,
    }));
    const outcome = completedOutcome(watch, {
      entries: [{ videoId: 'newVideo001', title: 'Duplicate', url: 'https://www.youtube.com/watch?v=newVideo001', publishedAt }],
    });
    const first = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome));
    expect(first).toMatchObject({ duplicateCount: 1, createdSources: [], replayed: false });
    const beforeReplay = await getChannelWatch(watch.id);
    const second = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome));
    expect(second).toMatchObject({ duplicateCount: 0, createdSources: [], replayed: true });
    expect(await getChannelWatch(watch.id)).toEqual(beforeReplay);
  });

  it('bounds persisted feed and job replay windows while retaining the newest ids', async () => {
    const { source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const seenVideoIds = Array.from(
      { length: CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT + 5 },
      (_, index) => `v${index.toString(36).padStart(10, '0')}`,
    );
    const processedRunnerJobIds = Array.from(
      { length: CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT + 5 },
      (_, index) => `job-cap-${index}`,
    );
    const seeded = {
      ...watch,
      seenVideoIds,
      processedRunnerJobIds,
      lastProcessedRunnerJobId: processedRunnerJobIds.at(-1)!,
    };
    await getDb().channelWatches.put(seeded);
    const publishedAt = new Date(Date.parse(watch.createdAt) + 30_000).toISOString();
    const outcome = completedOutcome(seeded, {
      jobId: 'job-cap-current',
      entries: [{
        videoId: 'capNewVid01',
        title: 'Newest bounded entry',
        url: 'https://www.youtube.com/watch?v=capNewVid01',
        publishedAt,
      }],
    });

    const reconciled = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome));
    expect(reconciled.watch.seenVideoIds).toHaveLength(CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT);
    expect(reconciled.watch.seenVideoIds).toContain('capNewVid01');
    expect(reconciled.watch.processedRunnerJobIds).toHaveLength(CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT);
    expect(reconciled.watch.processedRunnerJobIds.at(-1)).toBe('job-cap-current');
    expect(unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome))).toMatchObject({ replayed: true });

    const failedOutcome = {
      schemaVersion: 1 as const,
      status: 'failed' as const,
      jobId: 'job-cap-failed',
      watchId: watch.id,
      actionHash: watch.actionHash,
      channelId: watch.channelId,
      error: 'The runner stopped.',
    };
    const failed = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, failedOutcome));
    expect(failed.watch.processedRunnerJobIds).toHaveLength(CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT);
    expect(failed.watch.processedRunnerJobIds.at(-1)).toBe('job-cap-failed');
    expect(unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, failedOutcome))).toMatchObject({ replayed: true });
  });

  it('fails closed on binding mismatch, malformed feeds, and terminal failure without advancing last checked', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const mismatched = await reconcileChannelWatchRunnerOutcome(watch.id, completedOutcome(watch, { channelId: OTHER_CHANNEL_ID }));
    expect(mismatched.ok).toBe(false);
    expect(await getChannelWatch(watch.id)).toMatchObject({ lastCheckedAt: null, lastError: expect.stringContaining('match') });
    expect(await listSources(workspace.id)).toHaveLength(1);

    const oversized = await reconcileChannelWatchRunnerOutcome(watch.id, completedOutcome(watch, {
      jobId: 'job-feed-2',
      entries: Array.from({ length: 16 }, (_, index) => ({
        videoId: `video${String(index).padStart(6, '0')}`,
        title: `Video ${index}`,
        url: `https://www.youtube.com/watch?v=video${String(index).padStart(6, '0')}`,
        publishedAt: new Date(Date.parse(watch.createdAt) + 30_000).toISOString(),
      })),
    }));
    expect(oversized.ok).toBe(false);
    expect((await getChannelWatch(watch.id))?.processedRunnerJobIds).toContain('job-feed-2');
    expect(await listSources(workspace.id)).toHaveLength(1);

    const failed = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, {
      schemaVersion: 1,
      status: 'failed',
      jobId: 'job-feed-3',
      watchId: watch.id,
      actionHash: watch.actionHash,
      channelId: watch.channelId,
      error: 'The local runner timed out.',
    }));
    expect(failed.watch).toMatchObject({ lastCheckedAt: null, lastError: 'The local runner timed out.' });
    expect(failed.createdSources).toEqual([]);
  });

  it('rolls back drafts, watch state, and proof when any persistence step fails', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const before = await getChannelWatch(watch.id);
    const proofBefore = await getDb().proofEvents.where('workspaceId').equals(workspace.id).toArray();
    const write = vi.spyOn(getDb().sourceRecords, 'bulkAdd').mockRejectedValueOnce(new Error('injected draft failure'));
    try {
      await expect(reconcileChannelWatchRunnerOutcome(watch.id, completedOutcome(watch))).rejects.toThrow('injected draft failure');
    } finally {
      write.mockRestore();
    }
    expect(await getChannelWatch(watch.id)).toEqual(before);
    expect(await listSources(workspace.id)).toEqual([source]);
    expect(await getDb().lessons.where('workspaceId').equals(workspace.id).count()).toBe(1);
    expect(await getDb().proofEvents.where('workspaceId').equals(workspace.id).toArray()).toEqual(proofBefore);
  });

  it('exports, imports, remaps, and deletes channel watches with their workspace', async () => {
    const { workspace, source } = await sourceFixture();
    const watch = unwrap(await createChannelWatch({ sourceId: source.id }));
    const exported = unwrap(await exportWorkspace(workspace.id));
    expect(exported.channelWatches).toHaveLength(1);
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const importedWatches = await listChannelWatches(imported.workspaceId);
    expect(importedWatches).toHaveLength(1);
    expect(importedWatches[0]).toMatchObject({ channelId: CHANNEL_ID, enabled: false, revision: 1 });
    expect(importedWatches[0]!.disabledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(importedWatches[0]!.id).toBe(importedWatches[0]!.sourceId);
    expect(importedWatches[0]!.id).not.toBe(watch.id);
    expect(importedWatches[0]!.actionHash).toBe(await sha256Canonical({
      channelId: importedWatches[0]!.channelId,
      revision: importedWatches[0]!.revision,
      schedule: importedWatches[0]!.schedule,
      sourceId: importedWatches[0]!.sourceId,
      workspaceId: imported.workspaceId,
    }));
    const importedWatchProof = (await getDb().proofEvents.where('workspaceId').equals(imported.workspaceId).toArray())
      .filter((event) => event.type === 'channel_watch.created')
      .sort((left, right) => left.sequence - right.sequence)
      .at(-1);
    expect(importedWatchProof?.payload).toMatchObject({ actionHash: importedWatches[0]!.actionHash, imported: true });

    const blockedDelete = await deleteWorkspace(workspace.id);
    expect(blockedDelete).toMatchObject({
      ok: false,
      error: { code: 'conflict', message: expect.stringMatching(/stop every channel watch/i) },
    });
    expect(await getDb().workspaces.get(workspace.id)).toBeDefined();
    expect(await getDb().sourceRecords.get(source.id)).toBeDefined();
    expect(await getChannelWatch(watch.id)).toEqual(watch);

    unwrap(await disableChannelWatch(watch.id));
    unwrap(await deleteWorkspace(workspace.id));
    expect(await getChannelWatch(watch.id)).toBeUndefined();
  });

  it('rejects a structurally invalid channel watch even when the archive hash is recomputed', async () => {
    const { workspace, source } = await sourceFixture();
    unwrap(await createChannelWatch({ sourceId: source.id }));
    const exported = unwrap(await exportWorkspace(workspace.id));
    (exported.channelWatches![0] as Record<string, unknown>)['lastCheckedAt'] = { forged: true };
    exported.integrity.payloadSha256 = await sha256CanonicalExcluding(
      exported as unknown as Record<string, unknown>,
      ['integrity'],
    );

    const imported = await importWorkspace(JSON.stringify(exported));
    expect(imported).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('rejects imported watch replay windows over their persisted caps', async () => {
    const { workspace, source } = await sourceFixture();
    unwrap(await createChannelWatch({ sourceId: source.id }));

    for (const field of ['seenVideoIds', 'processedRunnerJobIds'] as const) {
      const exported = unwrap(await exportWorkspace(workspace.id));
      const watch = exported.channelWatches![0] as Record<string, unknown>;
      const limit = field === 'seenVideoIds'
        ? CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT
        : CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT;
      const values = Array.from(
        { length: limit + 1 },
        (_, index) => field === 'seenVideoIds' ? `v${index.toString(36).padStart(10, '0')}` : `job-import-${index}`,
      );
      watch[field] = values;
      if (field === 'processedRunnerJobIds') watch['lastProcessedRunnerJobId'] = values.at(-1)!;
      exported.integrity.payloadSha256 = await sha256CanonicalExcluding(
        exported as unknown as Record<string, unknown>,
        ['integrity'],
      );

      expect(await importWorkspace(JSON.stringify(exported))).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
  });
});
