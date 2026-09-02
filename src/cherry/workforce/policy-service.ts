/**
 * Policy engine: God Mode is a policy profile, not a bypass. Every consequential
 * action is an ActionIntent with a content hash; rules decide allow, require
 * approval or deny; an approval is fresh only for the exact intent, revision
 * and hash before expiry. Agents cannot approve. Decisions land in the ledger.
 */

import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { sha256Canonical } from '../core/hash.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import type { ActorType } from '../core/domain-event.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';
import type { PlanRisk } from './mission-plan-model.ts';

export const ACTION_CLASSES = [
  'read',
  'analyse',
  'sandbox_write',
  'test_run',
  'draft',
  'external_draft',
  'send',
  'publish',
  'merge',
  'deploy',
  'delete',
  'spend',
  'credential_change',
  'security_bypass',
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

export type PolicyEffect = 'allow' | 'require_approval' | 'deny';

export interface ActionIntent {
  id: string;
  workspaceId: string;
  missionId: string | null;
  workItemId: string | null;
  nodeId: string | null;
  actionClass: ActionClass;
  /** Catalogue id (capability-registry-service) or 'local'. */
  capabilityId: string;
  /** What the action touches: a path, repository, recipient, endpoint. */
  target: string;
  summary: string;
  riskLevel: PlanRisk;
  requestedBy: ActorType;
  requestedAt: string;
  expiresAt: string | null;
  revision: number;
  /** sha256Canonical over INTENT_HASH_FIELDS. */
  contentHash: string;
}

export const INTENT_HASH_FIELDS = ['id', 'workspaceId', 'missionId', 'workItemId', 'nodeId', 'actionClass', 'capabilityId', 'target', 'summary', 'riskLevel', 'revision'] as const;

export async function computeIntentHash(intent: ActionIntent): Promise<string> {
  const subject: Record<string, unknown> = {};
  for (const field of INTENT_HASH_FIELDS) subject[field] = intent[field];
  return sha256Canonical(subject);
}

export interface NewActionIntent {
  id?: string;
  workspaceId: string;
  missionId?: string | null;
  workItemId?: string | null;
  nodeId?: string | null;
  actionClass: ActionClass;
  capabilityId: string;
  target: string;
  summary: string;
  riskLevel: PlanRisk;
  requestedBy: ActorType;
  requestedAt?: string;
  expiresAt?: string | null;
  revision?: number;
}

/** Builds a hashed intent. Intents are not stored; they travel with envelopes and the ledger. */
export async function createActionIntent(input: NewActionIntent): Promise<ActionIntent> {
  const intent: ActionIntent = {
    id: input.id ?? newId('ai'),
    workspaceId: input.workspaceId,
    missionId: input.missionId ?? null,
    workItemId: input.workItemId ?? null,
    nodeId: input.nodeId ?? null,
    actionClass: input.actionClass,
    capabilityId: input.capabilityId,
    target: input.target,
    summary: input.summary,
    riskLevel: input.riskLevel,
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt ?? isoNow(),
    expiresAt: input.expiresAt ?? null,
    revision: input.revision ?? 1,
    contentHash: '',
  };
  intent.contentHash = await computeIntentHash(intent);
  return intent;
}

export interface PolicyRule {
  id: string;
  actionClass: ActionClass;
  effect: PolicyEffect;
  reason: string;
}

/** The God Mode profile from NORTHSTAR.md: automatic inside the sandbox, a person for anything outside it, never a bypass. */
export const DEFAULT_POLICY_RULES: readonly PolicyRule[] = [
  { id: 'allow-read', actionClass: 'read', effect: 'allow', reason: 'Reading approved local context is automatic.' },
  { id: 'allow-analyse', actionClass: 'analyse', effect: 'allow', reason: 'Deterministic analysis is automatic.' },
  { id: 'allow-sandbox-write', actionClass: 'sandbox_write', effect: 'allow', reason: 'Writing inside the isolated sandbox is automatic.' },
  { id: 'allow-test-run', actionClass: 'test_run', effect: 'allow', reason: 'Running approved tests is automatic.' },
  { id: 'allow-draft', actionClass: 'draft', effect: 'allow', reason: 'Drafting inside the sandbox is automatic.' },
  { id: 'approve-external-draft', actionClass: 'external_draft', effect: 'require_approval', reason: 'A draft created through a connector that writes needs a person.' },
  { id: 'approve-send', actionClass: 'send', effect: 'require_approval', reason: 'Sending email or messages needs a person.' },
  { id: 'approve-publish', actionClass: 'publish', effect: 'require_approval', reason: 'Publishing content needs a person.' },
  { id: 'approve-merge', actionClass: 'merge', effect: 'require_approval', reason: 'Merging code needs a person.' },
  { id: 'approve-deploy', actionClass: 'deploy', effect: 'require_approval', reason: 'Deploying to production needs a person.' },
  { id: 'approve-delete', actionClass: 'delete', effect: 'require_approval', reason: 'Deleting data needs a person.' },
  { id: 'approve-spend', actionClass: 'spend', effect: 'require_approval', reason: 'Spending money needs a person.' },
  { id: 'approve-credential-change', actionClass: 'credential_change', effect: 'require_approval', reason: 'Changing credentials needs a person.' },
  { id: 'deny-security-bypass', actionClass: 'security_bypass', effect: 'deny', reason: 'Security controls, CAPTCHAs, passwords and 2FA are never bypassed; a person takes over.' },
];

export interface PolicyDecision {
  intentId: string;
  contentHash: string;
  actionClass: ActionClass;
  effect: PolicyEffect;
  ruleId: string | null;
  reason: string;
  approvalId: string | null;
  decidedAt: string;
}

/** Same intent id, revision, workspace and content hash; decision approved; the intent has not expired. */
export function isApprovalFresh(approval: ApprovalRecord, intent: ActionIntent, nowIso: string = isoNow()): boolean {
  return approval.objectType === 'action_intent'
    && approval.workspaceId === intent.workspaceId
    && approval.objectId === intent.id
    && approval.objectRevision === intent.revision
    && approval.decision === 'approved'
    && approval.contentHash === intent.contentHash
    && (intent.expiresAt === null || nowIso <= intent.expiresAt);
}

/** Pure. Unknown action classes and empty rule sets fail closed. Denials ignore approvals. */
export function decide(
  intent: ActionIntent,
  rules: readonly PolicyRule[] = DEFAULT_POLICY_RULES,
  approvals: readonly ApprovalRecord[] = [],
  nowIso: string = isoNow(),
): PolicyDecision {
  const base = { intentId: intent.id, contentHash: intent.contentHash, actionClass: intent.actionClass, decidedAt: nowIso };
  const rule = rules.find((candidate) => candidate.actionClass === intent.actionClass);
  if (!rule) return { ...base, effect: 'deny', ruleId: null, reason: 'No policy rule covers this action class; denied.', approvalId: null };
  if (rule.effect === 'deny' || rule.effect === 'allow') return { ...base, effect: rule.effect, ruleId: rule.id, reason: rule.reason, approvalId: null };
  const fresh = approvals.find((approval) => isApprovalFresh(approval, intent, nowIso));
  if (fresh) return { ...base, effect: 'allow', ruleId: rule.id, reason: `Approved by a person (${fresh.id}).`, approvalId: fresh.id };
  return { ...base, effect: 'require_approval', ruleId: rule.id, reason: rule.reason, approvalId: null };
}

/** Human-only. Binds an ApprovalRecord to the exact intent revision and content hash. */
export async function approveIntent(
  workspaceId: string,
  intent: ActionIntent,
  actorType: ActorType = 'human',
  comment?: string,
): Promise<Result<ApprovalRecord>> {
  if (actorType !== 'human') return err('approval_required', 'Only a person may approve an action.');
  if (intent.workspaceId !== workspaceId) return err('validation', 'The intent belongs to another workspace.');
  // Hashing is async non-Dexie work, so it happens before the transaction.
  const contentHash = await computeIntentHash(intent);
  if (contentHash !== intent.contentHash) return err('conflict', 'The intent changed since it was hashed. Re-read it before approving.');

  return withWorkspaceTx(workspaceId, ['approvals'], async (ctx) => {
    const now = isoNow();
    const approval: ApprovalRecord = {
      id: newId('ap'),
      workspaceId,
      objectType: 'action_intent',
      objectId: intent.id,
      objectRevision: intent.revision,
      decision: 'approved',
      requestedAt: intent.requestedAt,
      requestedBy: intent.requestedBy,
      requestReason: intent.summary,
      decidedBy: 'user',
      decidedAt: now,
      contentHash,
      ...(comment ? { comment } : {}),
    };
    await ctx.db.approvals.add(approval);
    ctx.emit({
      type: 'policy.decided',
      actorType: 'human',
      objectType: 'action_intent',
      objectId: intent.id,
      summary: `Action "${intent.summary}" (${intent.actionClass}) approved by a person`,
      payload: { intentId: intent.id, actionClass: intent.actionClass, effect: 'allow', approvalId: approval.id, contentHash, target: intent.target },
    });
    return ok(approval);
  });
}

/** Appends the decision to the ledger so every allow, denial and wait is explainable. */
export async function recordPolicyDecision(workspaceId: string, intent: ActionIntent, decision: PolicyDecision): Promise<Result<PolicyDecision>> {
  if (intent.workspaceId !== workspaceId || decision.intentId !== intent.id) return err('validation', 'The decision does not belong to this intent and workspace.');
  await withWorkspaceTx(workspaceId, [], async (ctx) => {
    ctx.emit({
      type: 'policy.decided',
      actorType: 'system',
      objectType: 'action_intent',
      objectId: intent.id,
      summary: `Policy ${decision.effect} for "${intent.summary}" (${intent.actionClass}): ${decision.reason}`,
      payload: {
        intentId: intent.id,
        actionClass: intent.actionClass,
        effect: decision.effect,
        ruleId: decision.ruleId,
        approvalId: decision.approvalId,
        contentHash: decision.contentHash,
        target: intent.target,
      },
    });
  });
  return ok(decision);
}
