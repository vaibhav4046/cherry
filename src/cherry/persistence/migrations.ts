import type { Transaction } from 'dexie';

export interface CherryMigration {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (transaction: Transaction) => void | Promise<unknown>;
}

/**
 * Versioned IndexedDB schema. Add a new entry rather than editing an existing
 * one: shipped databases are upgraded in place and must never lose user data.
 */
export const CHERRY_DB_MIGRATIONS: CherryMigration[] = [
  {
    version: 1,
    stores: {
      workspaces: 'id, createdAt, updatedAt',
      missions: 'id, workspaceId, state, updatedAt',
      missionTasks: 'id, workspaceId, missionId, order',
      lessons: 'id, workspaceId, missionId, updatedAt',
      transcriptSegments: 'id, workspaceId, lessonId, startSeconds',
      observations: 'id, workspaceId, lessonId, timestampSeconds',
      evidence: 'id, workspaceId, missionId, lessonId, trust, updatedAt',
      skillGraphs: 'id, workspaceId, missionId, status, updatedAt',
      skillVersions: 'id, workspaceId, skillGraphId, revision',
      memories: 'id, workspaceId, status, type, scope, updatedAt',
      memoryVersions: 'id, workspaceId, memoryId, revision',
      approvals: 'id, workspaceId, objectId, decidedAt',
      artifactSets: 'id, workspaceId, missionId',
      artifactFiles: 'id, workspaceId, artifactSetId, path',
      artifactVersions: 'id, workspaceId, artifactFileId, revision',
      verifications: 'id, workspaceId, missionId, startedAt',
      runs: 'id, workspaceId, missionId, status, createdAt',
      proofEvents: 'id, workspaceId, sequence, [workspaceId+sequence], occurredAt',
      receipts: 'receiptId, workspaceId, missionId, createdAt',
      settings: 'key',
    },
  },
  {
    version: 2,
    stores: {
      agentProfiles: 'id, workspaceId, slug, status, updatedAt',
      crews: 'id, workspaceId, updatedAt',
      workItems: 'id, workspaceId, status, priority, updatedAt',
      workMessages: 'id, workspaceId, workItemId, createdAt',
      handoffs: 'id, workspaceId, workItemId, status, createdAt',
      executionHosts: 'id, workspaceId, kind, status',
      routines: 'id, workspaceId, skillGraphId, enabled, nextRunAt',
    },
  },
  {
    version: 3,
    stores: {
      sourceRecords: 'id, workspaceId, lessonId, kind, status, updatedAt',
    },
  },
  {
    version: 4,
    stores: {
      channelWatches: 'id, workspaceId, sourceId, channelId, &[workspaceId+channelId], enabled, updatedAt',
    },
  },
];

export const CHERRY_DB_VERSION = CHERRY_DB_MIGRATIONS[CHERRY_DB_MIGRATIONS.length - 1]!.version;
