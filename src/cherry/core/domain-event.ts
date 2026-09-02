import type { JsonValue } from './canonical-json.ts';

/**
 * ProofEvent is Cherry's append-only ledger record. Every domain mutation that a
 * user or agent could later be asked to justify emits one, in the same
 * transaction as the mutation wherever the storage engine allows it.
 */
export const PROOF_EVENT_TYPES = [
  'workspace.created',
  'workspace.imported',
  'mission.created',
  'mission.updated',
  'mission.state_changed',
  'lesson.loaded',
  'lesson.updated',
  'lesson.transcript_imported',
  'lesson.playback',
  'source.saved',
  'source.updated',
  'source.fetch_requested',
  'source.fetch_completed',
  'source.fetch_failed',
  'channel_watch.created',
  'channel_watch.checked',
  'channel_watch.failed',
  'channel_watch.disabled',
  'skill_proposal.created',
  'skill_proposal.updated',
  'skill_proposal.dismissed',
  'observation.recorded',
  'evidence.added',
  'evidence.updated',
  'evidence.trust_changed',
  'evidence.deleted',
  'skillgraph.drafted',
  'skillgraph.revised',
  'skillgraph.approval_requested',
  'skillgraph.approved',
  'skillgraph.rejected',
  'skillgraph.rolled_back',
  'memory.proposed',
  'memory.approved',
  'memory.rejected',
  'memory.superseded',
  'memory.deleted',
  'memory.pinned',
  'artifact.file_written',
  'artifact.file_deleted',
  'artifact.history_purged',
  'artifact.preview_error',
  'verification.started',
  'verification.completed',
  'repair.applied',
  'run.queued',
  'run.updated',
  'receipt.created',
  'export.created',
  'tool.invoked',
  'tool.rejected',
  'agent.profile_created',
  'agent.profile_archived',
  'crew.created',
  'work.item_created',
  'work.item_transitioned',
  'work.item_assigned',
  'work.message_added',
  'routine.drafted',
  'routine.schedule_set',
  'routine.approved',
  'routine.enabled',
  'routine.paused',
  'routine.run_requested',
  'mission.plan_created',
  'mission.plan_revised',
  'mission.plan_approved',
  'mission.plan_started',
  'mission.plan_status',
  'mission.node_updated',
  'evaluation.recorded',
  'policy.decided',
  'sandbox.leased',
  'sandbox.released',
] as const;

export type ProofEventType = (typeof PROOF_EVENT_TYPES)[number];

export type ActorType = 'human' | 'agent' | 'system' | 'runner';

export interface ProofEvent {
  id: string;
  workspaceId: string;
  sequence: number;
  type: ProofEventType;
  actorType: ActorType;
  actorId?: string;
  occurredAt: string;
  objectType: string;
  objectId: string;
  summary: string;
  /** Payload is hashed into the receipt; it must never contain secrets. */
  payload?: Record<string, JsonValue>;
  payloadHash?: string;
}

export interface NewProofEvent {
  type: ProofEventType;
  actorType: ActorType;
  actorId?: string;
  objectType: string;
  objectId: string;
  summary: string;
  payload?: Record<string, JsonValue>;
}
