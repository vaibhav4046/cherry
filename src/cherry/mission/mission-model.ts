export interface WorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Marks a workspace created from the shipped importable example. */
  isExample?: boolean;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export const MISSION_STATES = [
  'DRAFT',
  'LEARNING',
  'PLANNING',
  'AWAITING_APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'COMPLETE',
  'BLOCKED',
  'CANCELLED',
] as const;

export type MissionState = (typeof MISSION_STATES)[number];

export interface MissionStateChange {
  from: MissionState | null;
  to: MissionState;
  at: string;
  actorType: 'human' | 'agent' | 'system' | 'runner';
  reason?: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Mission {
  id: string;
  workspaceId: string;
  title: string;
  objective: string;
  definitionOfDone: string[];
  constraints: string[];
  nonGoals: string[];
  agentRole: string;
  allowedToolIds: string[];
  requiredMemoryIds: string[];
  riskLevel: RiskLevel;
  state: MissionState;
  stateHistory: MissionStateChange[];
  lessonId?: string | null;
  skillGraphId?: string | null;
  artifactSetId?: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissionTask {
  id: string;
  workspaceId: string;
  missionId: string;
  routineId?: string | null;
  order: number;
  title: string;
  detail: string;
  dependsOn: string[];
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  resultSummary?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus =
  | 'queued'
  | 'waiting_for_runner'
  | 'setup-required'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface RunRecord {
  id: string;
  workspaceId: string;
  missionId: string;
  adapter: 'manual' | 'cherry-verify' | 'cherry-export' | 'shell-safe' | 'codex-cli' | 'claude-cli';
  status: RunStatus;
  mode: 'manual' | 'webmcp' | 'runner';
  summary: string;
  detail?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  command?: string;
  outputSummary?: string;
  error?: string | null;
  receiptId?: string | null;
  idempotencyKey?: string;
  runnerCapabilityToken?: string;
  runnerJobId?: string | null;
  verificationId?: string | null;
  provider?: { kind: string; status: string; exitCode?: number; verifiedSeparately: boolean };
  revision: number;
  createdAt: string;
  updatedAt: string;
}
