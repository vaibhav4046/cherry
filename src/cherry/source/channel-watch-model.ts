import type { SourceRecord } from './source-model.ts';

export interface ChannelWatchSchedule {
  kind: 'interval';
  everyMinutes: 1440;
  startAt: string;
}

/** Covers every job the runner exposes for reconciliation, with ample headroom. */
export const CHANNEL_WATCH_PROCESSED_JOB_ID_LIMIT = 512;
/** Recent feed ids supplement workspace-wide source URL deduplication. */
export const CHANNEL_WATCH_SEEN_VIDEO_ID_LIMIT = 2_048;

/** A human-created, local-runner channel-feed subscription. */
export interface ChannelWatch {
  /** Equal to sourceId so one source has at most one watch. */
  id: string;
  workspaceId: string;
  sourceId: string;
  channelId: string;
  channelName: string | null;
  enabled: boolean;
  schedule: ChannelWatchSchedule;
  revision: number;
  actionHash: string;
  seenVideoIds: string[];
  processedRunnerJobIds: string[];
  lastProcessedRunnerJobId: string | null;
  lastAttemptedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastFeedHash: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelFeedEntry {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
}

interface ChannelWatchRunnerBinding {
  schemaVersion: 1;
  jobId: string;
  watchId: string;
  actionHash: string;
  channelId: string;
}

export interface CompletedChannelWatchRunnerOutcome extends ChannelWatchRunnerBinding {
  status: 'completed';
  checkedAt: string;
  channelName: string;
  feedHash: string;
  entries: ChannelFeedEntry[];
}

export interface FailedChannelWatchRunnerOutcome extends ChannelWatchRunnerBinding {
  status: 'failed';
  error: string;
}

export type ChannelWatchRunnerOutcome = CompletedChannelWatchRunnerOutcome | FailedChannelWatchRunnerOutcome;

export interface ChannelWatchReconcileResult {
  watch: ChannelWatch;
  createdSources: SourceRecord[];
  skippedBeforeWatch: number;
  duplicateCount: number;
  replayed: boolean;
}
