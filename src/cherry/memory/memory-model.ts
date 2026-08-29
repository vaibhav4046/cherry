import type { MemoryScope, MemorySensitivity, MemoryType } from '../skillgraph/skillgraph-model.ts';

export type { MemoryScope, MemorySensitivity, MemoryType };

export type MemoryStatus = 'proposed' | 'approved' | 'rejected' | 'superseded' | 'expired' | 'deleted';

export type MemoryProvenanceSource =
  | 'human'
  | 'video-transcript'
  | 'video-visual'
  | 'webpage'
  | 'repository'
  | 'document'
  | 'tool-result'
  | 'run'
  | 'correction'
  | 'import';

export interface MemoryProvenance {
  id: string;
  sourceType: MemoryProvenanceSource;
  sourceId?: string | null;
  uri?: string | null;
  timestampSeconds?: number;
  trust: 'untrusted' | 'reviewed' | 'approved';
  capturedAt: string;
  description: string;
  contentHash?: string;
}

export interface MemoryRecord {
  schemaVersion: '1.0.0';
  id: string;
  workspaceId: string;
  projectId?: string | null;
  missionId?: string | null;
  runId?: string | null;
  type: MemoryType;
  title: string;
  content: string;
  status: MemoryStatus;
  scope: MemoryScope;
  sensitivity: MemorySensitivity;
  confidence: number;
  tags?: string[];
  provenance: MemoryProvenance[];
  derivedFromMemoryIds?: string[];
  supersedesId?: string | null;
  supersededById?: string | null;
  revision: number;
  approvedRevision?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  reviewAt?: string | null;
  lastUsedAt?: string | null;
  useCount?: number;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}

export interface MemoryVersion {
  id: string;
  workspaceId: string;
  memoryId: string;
  revision: number;
  snapshot: MemoryRecord;
  changeSummary: string;
  createdAt: string;
}

/** How a correction is classified before it can affect future work. */
export const CORRECTION_CLASSES = [
  'one_run_instruction',
  'mission_rule',
  'project_preference',
  'global_preference',
  'safety_policy',
  'procedure_update',
  'evaluation_assertion',
] as const;

export type CorrectionClass = (typeof CORRECTION_CLASSES)[number];

export const CORRECTION_CLASS_TARGET: Record<
  CorrectionClass,
  { type: MemoryType; scope: MemoryScope; createsAssertion: boolean; label: string }
> = {
  one_run_instruction: { type: 'episode', scope: 'run', createsAssertion: false, label: 'One-run instruction' },
  mission_rule: { type: 'procedure', scope: 'mission', createsAssertion: false, label: 'Mission rule' },
  project_preference: { type: 'preference', scope: 'project', createsAssertion: false, label: 'Project preference' },
  global_preference: { type: 'preference', scope: 'global', createsAssertion: false, label: 'Global preference' },
  safety_policy: { type: 'policy', scope: 'workspace', createsAssertion: false, label: 'Safety policy' },
  procedure_update: { type: 'procedure', scope: 'workspace', createsAssertion: false, label: 'Procedure update' },
  evaluation_assertion: { type: 'procedure', scope: 'mission', createsAssertion: true, label: 'Evaluation assertion' },
};
