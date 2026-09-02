import type { SourceRecord } from './source-model.ts';

export const PROPOSAL_READINESS = ['needs-transcript', 'draft-ready', 'drafted', 'approved', 'dismissed'] as const;

export type ProposalReadiness = (typeof PROPOSAL_READINESS)[number];

/**
 * A deterministic starting point Cherry derives from a creator's upload: the
 * title, the optional plain-text description, and the transcript a person
 * supplied. It is never an approval and never a fetched video or caption.
 */
export interface SkillProposal {
  /** Equal to sourceId so one source has at most one proposal. */
  id: string;
  workspaceId: string;
  sourceId: string;
  creatorName: string | null;
  sourceTitle: string;
  publishedAt: string;
  name: string;
  teaches: string;
  candidateSteps: string[];
  readiness: ProposalReadiness;
  missionId: string | null;
  skillGraphId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Descriptions are untrusted feed text; keep them short and plain. */
export const MAX_PROPOSAL_DESCRIPTION_CHARS = 2000;
export const MAX_PROPOSAL_TEACHES_CHARS = 240;
export const MAX_PROPOSAL_NAME_CHARS = 120;
export const MAX_PROPOSAL_STEPS = 10;
export const MAX_PROPOSAL_STEP_CHARS = 120;

/** Only a live YouTube source can carry a proposal. */
export function isProposalEligibleSource(source: Pick<SourceRecord, 'kind' | 'status'>): boolean {
  return source.kind === 'youtube' && source.status !== 'archived';
}
