/** Public projection whose SHA-256 digest is pinned outside the replay payload. */
export type RecordedMissionStateName =
  | 'idle'
  | 'planning'
  | 'parallel'
  | 'verifying'
  | 'needs_human'
  | 'complete';

export interface RecordedMissionCheck {
  id: string;
  name: string;
  status: string;
  detail: string;
}

export interface RecordedMissionWorker {
  id: string;
  label: string;
  workspaceLabel: string;
  boundary: string;
  baseCommit: string;
  hostVersion: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  verificationStartedAt: string;
  checks: RecordedMissionCheck[];
}

export interface RecordedMissionFixture {
  schemaVersion: 1;
  label: 'Recorded real Codex run';
  source: {
    kind: 'committed-real-host-capture';
    captureCommit: string;
    captureSha256: string;
  };
  mission: {
    id: string;
    outcome: string;
    status: 'succeeded';
    startedAt: string;
    finishedAt: string;
  };
  states: Array<{
    state: RecordedMissionStateName;
    at: string;
    title: string;
    summary: string;
  }>;
  overlap: {
    workerIds: string[];
    durationMs: number;
    maxConcurrentNodes: number;
  };
  workers: RecordedMissionWorker[];
  events: Array<{
    sequence: number;
    jobId: string;
    type: string;
    at: string;
    chain: string;
  }>;
  integrity: {
    algorithm: 'SHA-256';
    replaySha256: string;
  };
}

export function canonicalJson(value: unknown): string;
export function buildRecordedMissionFixture(captureText: string): Promise<RecordedMissionFixture>;
export function verifyRecordedMissionFixture(candidate: unknown, expectedReplaySha256?: string): Promise<boolean>;
