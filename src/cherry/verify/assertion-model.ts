import type { EvaluationSeverity, EvaluationType } from '../skillgraph/skillgraph-model.ts';

export type AssertionStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

export interface AssertionResult {
  id: string;
  name: string;
  type: EvaluationType;
  severity: EvaluationSeverity;
  status: AssertionStatus;
  startedAt: string;
  finishedAt: string;
  /** Human-readable evidence lines. Never contains secrets or full documents. */
  evidence: string[];
  actual?: unknown;
  expected?: unknown;
  errorCode?: string | null;
}

export interface VerificationReport {
  id: string;
  workspaceId: string;
  missionId: string;
  skillGraphId?: string | null;
  skillGraphRevision?: number | null;
  artifactSetId?: string | null;
  startedAt: string;
  finishedAt: string;
  status: 'passed' | 'failed';
  results: AssertionResult[];
  blockingFailures: number;
  totalAssertions: number;
  /** Set when this report re-ran after a repair. */
  repairedFromVerificationId?: string | null;
}

export interface VerificationContext {
  workspaceId: string;
  missionId: string;
  actorType: 'human' | 'agent' | 'system' | 'runner';
}
