import { getDb } from './cherry-db.ts';
import { appendProofEvents } from './transactions.ts';
import { newId, isValidId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256Canonical, sha256CanonicalExcluding } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid, notFound } from '../core/errors.ts';
import type { NewProofEvent } from '../core/domain-event.ts';
import { parseYouTubeChannelId } from '../source/youtube-channel-id.ts';
import {
  CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT,
  CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT,
} from '../source/channel-watch-model.ts';

export const WORKSPACE_EXPORT_VERSION = '1.0.0';

export interface WorkspaceExport {
  schemaVersion: typeof WORKSPACE_EXPORT_VERSION;
  exportId: string;
  exportedAt: string;
  workspace: Record<string, unknown>;
  missions: unknown[];
  missionTasks: unknown[];
  lessons: unknown[];
  transcriptSegments: unknown[];
  observations: unknown[];
  evidence: unknown[];
  skillGraphs: unknown[];
  skillVersions: unknown[];
  memories: unknown[];
  memoryVersions: unknown[];
  approvals: unknown[];
  artifactSets: unknown[];
  artifactFiles: unknown[];
  artifactVersions: unknown[];
  verifications: unknown[];
  runs: unknown[];
  proofEvents: unknown[];
  proofReceipts: unknown[];
  settings: Record<string, unknown>;
  sourceRecords?: unknown[];
  channelWatches?: unknown[];
  integrity: {
    canonicalization: 'JCS-RFC8785';
    hashAlgorithm: 'SHA-256';
    payloadSha256: string;
  };
}

const INTEGRITY_EXCLUSIONS = ['integrity'];

/** Serialize one workspace, with a recomputable payload hash. */
export async function exportWorkspace(workspaceId: string): Promise<Result<WorkspaceExport>> {
  const db = getDb();
  const workspace = await db.workspaces.get(workspaceId);
  if (!workspace) return notFound('Workspace', workspaceId);

  const byWorkspace = <T>(rows: T[]): T[] => rows;
  const load = async (table: { where: (index: string) => { equals: (value: string) => { toArray: () => Promise<unknown[]> } } }) =>
    byWorkspace(await table.where('workspaceId').equals(workspaceId).toArray());

  const data: WorkspaceExport = {
    schemaVersion: WORKSPACE_EXPORT_VERSION,
    exportId: newId('ws'),
    exportedAt: isoNow(),
    workspace: workspace as unknown as Record<string, unknown>,
    missions: await load(db.missions),
    missionTasks: await load(db.missionTasks),
    lessons: await load(db.lessons),
    transcriptSegments: await load(db.transcriptSegments),
    observations: await load(db.observations),
    evidence: await load(db.evidence),
    skillGraphs: await load(db.skillGraphs),
    skillVersions: await load(db.skillVersions),
    memories: await load(db.memories),
    memoryVersions: await load(db.memoryVersions),
    approvals: await load(db.approvals),
    artifactSets: await load(db.artifactSets),
    artifactFiles: await load(db.artifactFiles),
    artifactVersions: await load(db.artifactVersions),
    verifications: await load(db.verifications),
    runs: await load(db.runs),
    proofEvents: await load(db.proofEvents),
    proofReceipts: await load(db.receipts),
    settings: {},
    sourceRecords: await load(db.sourceRecords),
    channelWatches: await load(db.channelWatches),
    integrity: {
      canonicalization: 'JCS-RFC8785',
      hashAlgorithm: 'SHA-256',
      payloadSha256: '',
    },
  };

  data.integrity.payloadSha256 = await sha256CanonicalExcluding(
    data as unknown as Record<string, unknown>,
    INTEGRITY_EXCLUSIONS,
  );

  await appendProofEvents(workspaceId, [
    {
      type: 'export.created',
      actorType: 'system',
      objectType: 'workspace',
      objectId: workspaceId,
      summary: `Workspace exported (${data.missions.length} missions, hash ${data.integrity.payloadSha256.slice(0, 12)}…)`,
    },
  ]);

  return ok(data);
}

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const ARRAY_LIMITS: Array<[keyof WorkspaceExport, number]> = [
  ['missions', 1000],
  ['lessons', 1000],
  ['evidence', 100000],
  ['skillGraphs', 1000],
  ['memories', 100000],
  ['artifactSets', 1000],
  ['artifactFiles', 20000],
  ['runs', 10000],
  ['proofEvents', 200000],
  ['proofReceipts', 10000],
  ['sourceRecords', 10000],
  ['channelWatches', 10000],
];

/**
 * Validates and imports an exported workspace as a NEW workspace. The payload
 * is fully validated (shape, hash, limits) before anything is written; a
 * corrupt archive changes nothing.
 */
export async function importWorkspace(
  raw: string,
  options?: { markExample?: boolean },
): Promise<Result<{ workspaceId: string; name: string; hashVerified: boolean }>> {
  if (raw.length > MAX_IMPORT_BYTES) return invalid('Import exceeds the 64 MiB limit');

  let parsed: WorkspaceExport;
  try {
    parsed = JSON.parse(raw) as WorkspaceExport;
  } catch (error) {
    return invalid(`Import is not valid JSON: ${(error as Error).message}`);
  }

  if (parsed.schemaVersion !== WORKSPACE_EXPORT_VERSION) {
    return invalid(`Unsupported export version ${String(parsed.schemaVersion)}`);
  }
  const workspace = parsed.workspace as { id?: unknown; name?: unknown; revision?: unknown };
  if (!workspace || !isValidId(workspace.id) || typeof workspace.name !== 'string' || !workspace.name.trim()) {
    return invalid('Export has no valid workspace record');
  }
  for (const [key, limit] of ARRAY_LIMITS) {
    const value = parsed[key];
    if ((key === 'sourceRecords' || key === 'channelWatches') && value === undefined) continue;
    if (!Array.isArray(value)) return invalid(`Export field ${String(key)} must be an array`);
    if (value.length > limit) return invalid(`Export field ${String(key)} exceeds the limit of ${limit}`);
  }

  let hashVerified = false;
  if (parsed.integrity && typeof parsed.integrity.payloadSha256 === 'string') {
    const recomputed = await sha256CanonicalExcluding(
      parsed as unknown as Record<string, unknown>,
      INTEGRITY_EXCLUSIONS,
    );
    if (recomputed !== parsed.integrity.payloadSha256) {
      return invalid('Export integrity hash does not match its content; the file was modified or corrupted', {
        stored: parsed.integrity.payloadSha256,
        recomputed,
      });
    }
    hashVerified = true;
  }

  // Remap EVERY record id so an import never collides with existing state,
  // while preserving internal references (mission.lessonId, snapshots, events).
  const idMap = new Map<string, string>();
  const claimId = (value: unknown): void => {
    if (typeof value !== 'string' || !isValidId(value) || idMap.has(value)) return;
    const dash = value.indexOf('-');
    const prefix = dash > 0 ? value.slice(0, dash) : 'ws';
    idMap.set(value, `${prefix}-${newId('ws').slice(3)}`);
  };
  claimId(workspace.id);
  const arrayKeys: Array<keyof WorkspaceExport> = [
    'missions', 'missionTasks', 'lessons', 'transcriptSegments', 'observations', 'evidence',
    'skillGraphs', 'skillVersions', 'memories', 'memoryVersions', 'approvals', 'artifactSets',
    'artifactFiles', 'artifactVersions', 'verifications', 'runs', 'proofEvents', 'proofReceipts', 'sourceRecords', 'channelWatches',
  ];
  for (const key of arrayKeys) {
    for (const row of (parsed[key] as unknown[]) ?? []) {
      const record = row as Record<string, unknown>;
      claimId(record['id']);
      claimId(record['receiptId']);
    }
  }
  // Rewrite all occurrences of every old id in one serialization pass. Ids are
  // ULID-based and globally unique strings, so a global replace is safe.
  let serialized = JSON.stringify(parsed);
  for (const [oldValue, newValue] of idMap) {
    serialized = serialized.split(`"${oldValue}"`).join(`"${newValue}"`);
  }
  parsed = JSON.parse(serialized) as WorkspaceExport;
  const newWorkspaceId = idMap.get(workspace.id as string)!;
  const remap = (rows: unknown[]): unknown[] => rows;
  const validIso = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
  };
  const validOptionalIso = (value: unknown): boolean => value === null || validIso(value);
  const importedSources = new Map<string, Record<string, unknown>>();
  for (const row of parsed.sourceRecords ?? []) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const source = row as Record<string, unknown>;
      if (typeof source['id'] === 'string') importedSources.set(source['id'], source);
    }
  }

  for (const row of parsed.channelWatches ?? []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid('Export contains an invalid channel watch');
    const watch = row as Record<string, unknown>;
    const schedule = watch['schedule'];
    const scheduleRecord = schedule && typeof schedule === 'object' && !Array.isArray(schedule)
      ? schedule as Record<string, unknown>
      : null;
    const scheduleStartAt = scheduleRecord?.['startAt'];
    const parsedChannel = typeof watch['channelId'] === 'string' ? parseYouTubeChannelId(watch['channelId']) : null;
    const seenVideoIds = watch['seenVideoIds'];
    const processedJobIds = watch['processedRunnerJobIds'];
    const source = typeof watch['sourceId'] === 'string' ? importedSources.get(watch['sourceId']) : undefined;
    if (
      !isValidId(watch['id'])
      || !isValidId(watch['sourceId'])
      || watch['id'] !== watch['sourceId']
      || watch['workspaceId'] !== newWorkspaceId
      || !parsedChannel?.ok
      || typeof watch['revision'] !== 'number'
      || !Number.isInteger(watch['revision'])
      || watch['revision'] < 1
      || typeof watch['enabled'] !== 'boolean'
      || !schedule
      || typeof schedule !== 'object'
      || Array.isArray(schedule)
      || scheduleRecord?.['kind'] !== 'interval'
      || scheduleRecord['everyMinutes'] !== 1440
      || typeof scheduleStartAt !== 'string'
      || !validIso(scheduleStartAt)
      || !Array.isArray(seenVideoIds)
      || seenVideoIds.length > CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT
      || !seenVideoIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id))
      || new Set(seenVideoIds).size !== seenVideoIds.length
      || !Array.isArray(processedJobIds)
      || processedJobIds.length > CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT
      || !processedJobIds.every((id) => typeof id === 'string' && isValidId(id))
      || new Set(processedJobIds).size !== processedJobIds.length
      || (watch['lastProcessedRunnerJobId'] !== null && !isValidId(watch['lastProcessedRunnerJobId']))
      || (processedJobIds.length === 0 ? watch['lastProcessedRunnerJobId'] !== null : watch['lastProcessedRunnerJobId'] !== processedJobIds.at(-1))
      || (watch['channelName'] !== null && (typeof watch['channelName'] !== 'string' || watch['channelName'].length > 200))
      || !validOptionalIso(watch['lastAttemptedAt'])
      || !validOptionalIso(watch['lastCheckedAt'])
      || !validOptionalIso(watch['disabledAt'])
      || (watch['lastError'] !== null && (typeof watch['lastError'] !== 'string' || watch['lastError'].length > 1000))
      || (watch['lastFeedHash'] !== null && (typeof watch['lastFeedHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(watch['lastFeedHash'])))
      || !validIso(watch['createdAt'])
      || !validIso(watch['updatedAt'])
      || (watch['enabled'] === true && watch['disabledAt'] !== null)
      || !source
      || source['workspaceId'] !== newWorkspaceId
      || source['kind'] !== 'youtube'
      || source['youtubeChannelId'] !== parsedChannel.value.channelId
      || (watch['enabled'] === true && source['status'] === 'archived')
    ) {
      return invalid('Export contains an invalid channel watch');
    }
    watch['channelId'] = parsedChannel.value.channelId;
    watch['actionHash'] = await sha256Canonical({
      channelId: watch['channelId'],
      revision: watch['revision'],
      schedule: watch['schedule'],
      sourceId: watch['sourceId'],
      workspaceId: watch['workspaceId'],
    });
  }

  const db = getDb();
  const now = isoNow();
  const importedWorkspace = {
    ...(parsed.workspace as Record<string, unknown>),
    id: newWorkspaceId,
    name: `${String(workspace.name)}${options?.markExample ? '' : ' (imported)'}`,
    updatedAt: now,
    ...(options?.markExample ? { isExample: true } : {}),
  };

  try {
  await db.transaction(
    'rw',
    [
      db.workspaces,
      db.missions,
      db.missionTasks,
      db.lessons,
      db.transcriptSegments,
      db.observations,
      db.evidence,
      db.skillGraphs,
      db.skillVersions,
      db.memories,
      db.memoryVersions,
      db.approvals,
      db.artifactSets,
      db.artifactFiles,
      db.artifactVersions,
      db.verifications,
      db.runs,
      db.proofEvents,
      db.receipts,
      db.sourceRecords,
      db.channelWatches,
    ],
    async () => {
      await db.workspaces.add(importedWorkspace as never);
      await db.missions.bulkAdd(remap(parsed.missions) as never[]);
      await db.missionTasks.bulkAdd(remap(parsed.missionTasks ?? []) as never[]);
      await db.lessons.bulkAdd(remap(parsed.lessons) as never[]);
      await db.transcriptSegments.bulkAdd(remap(parsed.transcriptSegments ?? []) as never[]);
      await db.observations.bulkAdd(remap(parsed.observations ?? []) as never[]);
      await db.evidence.bulkAdd(remap(parsed.evidence) as never[]);
      await db.skillGraphs.bulkAdd(remap(parsed.skillGraphs) as never[]);
      await db.skillVersions.bulkAdd(remap(parsed.skillVersions ?? []) as never[]);
      await db.memories.bulkAdd(remap(parsed.memories) as never[]);
      await db.memoryVersions.bulkAdd(remap(parsed.memoryVersions ?? []) as never[]);
      await db.approvals.bulkAdd(remap(parsed.approvals ?? []) as never[]);
      await db.artifactSets.bulkAdd(remap(parsed.artifactSets) as never[]);
      await db.artifactFiles.bulkAdd(remap(parsed.artifactFiles ?? []) as never[]);
      await db.artifactVersions.bulkAdd(remap(parsed.artifactVersions ?? []) as never[]);
      await db.verifications.bulkAdd(remap(parsed.verifications ?? []) as never[]);
      await db.runs.bulkAdd(remap(parsed.runs) as never[]);
      await db.proofEvents.bulkAdd(remap(parsed.proofEvents ?? []) as never[]);
      await db.receipts.bulkAdd(remap(parsed.proofReceipts ?? []) as never[]);
      await db.sourceRecords.bulkAdd(remap(parsed.sourceRecords ?? []) as never[]);
      await db.channelWatches.bulkAdd(remap(parsed.channelWatches ?? []) as never[]);
    },
  );
  } catch (error) {
    return invalid(
      'Import failed: the export overlaps records that already exist here. Delete the original workspace first, then import again.',
      { cause: (error as Error).message },
    );
  }

  const importEvents: NewProofEvent[] = [
    {
      type: 'workspace.imported',
      actorType: 'human',
      objectType: 'workspace',
      objectId: newWorkspaceId,
      summary: `Workspace imported from export ${parsed.exportId} (hash ${hashVerified ? 'verified' : 'absent'})`,
    },
  ];
  for (const row of parsed.channelWatches ?? []) {
    const watch = row as Record<string, unknown>;
    importEvents.push({
      type: 'channel_watch.created',
      actorType: 'human',
      objectType: 'channel_watch',
      objectId: String(watch['id']),
      summary: `Channel watch restored from import for ${String(watch['channelId'])}`,
      payload: {
        channelId: String(watch['channelId']),
        sourceId: String(watch['sourceId']),
        revision: Number(watch['revision']),
        actionHash: String(watch['actionHash']),
        imported: true,
      },
    });
  }
  await appendProofEvents(newWorkspaceId, importEvents);

  return ok({ workspaceId: newWorkspaceId, name: String(importedWorkspace['name']), hashVerified });
}
