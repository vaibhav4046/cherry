export type ApprovalObjectType =
  | 'skillgraph'
  | 'memory'
  | 'consequential_action'
  | 'runner_job'
  | 'routine'
  | 'mission_plan'
  | 'action_intent';

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
  /** Browser session that made the decision. Identifies the session, not a person. */
  decidedSessionId?: string;
  comment?: string;
  /**
   * Canonical hash of the exact content the decision binds to. Recorded when
   * the approval is requested and re-checked when it is decided, so an edit
   * that keeps the revision number but changes the content still makes the
   * pending approval stale.
   */
  contentHash?: string;
}
