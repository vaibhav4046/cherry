export const EVIDENCE_SOURCE_TYPES = [
  'video',
  'transcript',
  'document',
  'repository',
  'webpage',
  'observation',
  'tool_output',
  'user_statement',
  'run_result',
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

/** Everything imported from outside Cherry starts untrusted. */
export const TRUST_LEVELS = ['untrusted', 'reviewed', 'approved'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export type ProvenanceMethod =
  | 'user_typed'
  | 'user_upload'
  | 'creator_authorized_captions'
  | 'local_transcription'
  | 'agent_observation'
  | 'tool_result'
  | 'unknown';

export interface EvidenceHistoryEntry {
  at: string;
  action: 'created' | 'updated' | 'trust_changed' | 'deleted';
  actorType: 'human' | 'agent' | 'system' | 'runner';
  summary: string;
}

export interface EvidenceRecord {
  id: string;
  workspaceId: string;
  missionId?: string | null;
  lessonId?: string | null;
  sourceType: EvidenceSourceType;
  sourceUri?: string | null;
  sourceTitle?: string | null;
  sourceCreator?: string | null;
  timestampSeconds?: number | null;
  claim: string;
  detail?: string;
  provenanceMethod: ProvenanceMethod;
  trust: TrustLevel;
  confidence: number;
  transferability: 'transferable' | 'source_specific' | 'unknown';
  usedByNodeIds: string[];
  contentHash?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  history: EvidenceHistoryEntry[];
}
