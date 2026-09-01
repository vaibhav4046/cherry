export type TranscriptSource =
  | 'user_text'
  | 'user_upload'
  | 'creator_authorized_captions'
  | 'local_transcription'
  | 'runner_fetch'
  | 'unknown';

export interface CoverageCriterion {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  satisfiedByObservationIds: string[];
}

export interface Lesson {
  id: string;
  workspaceId: string;
  missionId?: string | null;
  title: string;
  /** Normalised YouTube video id when the lesson is a permitted video. */
  videoId?: string | null;
  canonicalUrl?: string | null;
  creator?: string | null;
  kind: 'youtube' | 'manual';
  durationSeconds?: number | null;
  permissionAcknowledgedAt?: string | null;
  permissionNote?: string;
  transcriptSource?: TranscriptSource | null;
  transcriptImportedAt?: string | null;
  /** Declared evidence criteria. Coverage cannot be complete without them. */
  coverageCriteria: CoverageCriterion[];
  lastPositionSeconds: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  workspaceId: string;
  lessonId: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  source: TranscriptSource;
}

export type ObservationKind = 'spoken' | 'visual' | 'inferred';

export interface Observation {
  id: string;
  workspaceId: string;
  lessonId: string;
  timestampSeconds: number;
  kind: ObservationKind;
  text: string;
  transferability: 'transferable' | 'source_specific' | 'unknown';
  uncertainty: 'confident' | 'uncertain' | 'needs_review';
  evidenceId?: string | null;
  createdAt: string;
  updatedAt: string;
  actorType: 'human' | 'agent';
}

export interface CoverageGap {
  startSeconds: number;
  endSeconds: number;
  reason: 'no_observation' | 'criterion_unmet' | 'uninspected';
  label?: string;
}

export interface CoverageReport {
  lessonId: string;
  durationSeconds: number | null;
  transcriptSegmentCount: number;
  transcriptCoveredSeconds: number;
  observationCount: number;
  visualObservationCount: number;
  spokenObservationCount: number;
  criteriaTotal: number;
  criteriaSatisfied: number;
  gaps: CoverageGap[];
  uncertaintyCount: number;
  /** Never true while a declared criterion is unmet or criteria are absent. */
  complete: boolean;
  completenessNote: string;
}
