export type ApprovalObjectType = 'skillgraph' | 'memory' | 'consequential_action' | 'runner_job';

export interface ApprovalRecord {
  id: string;
  workspaceId: string;
  objectType: ApprovalObjectType;
  objectId: string;
  /** Approvals bind to an exact revision. A later edit invalidates them. */
  objectRevision: number;
  decision: 'approved' | 'rejected' | 'pending';
  requestedAt: string;
  requestedBy: string;
  requestReason: string;
  decidedBy?: string;
  decidedAt?: string;
  comment?: string;
  contentHash?: string;
}
