import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import type { ApprovalRecord } from '../../src/cherry/approval/approval-model.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import {
  ACTION_CLASSES,
  DEFAULT_POLICY_RULES,
  approveIntent,
  computeIntentHash,
  createActionIntent,
  decide,
  isApprovalFresh,
  recordPolicyDecision,
  type ActionClass,
  type ActionIntent,
} from '../../src/cherry/workforce/policy-service.ts';

const NOW = '2026-09-02T12:00:00.000Z';

async function intent(actionClass: ActionClass, overrides: Partial<ActionIntent> = {}): Promise<ActionIntent> {
  return createActionIntent({
    workspaceId: 'ws-1',
    missionId: 'ms-1',
    workItemId: 'wk-1',
    nodeId: 'developer-fix',
    actionClass,
    capabilityId: 'terminal.execute',
    target: 'sandbox:/artifacts',
    summary: `${actionClass} inside the sandbox`,
    riskLevel: 'medium',
    requestedBy: 'agent',
    requestedAt: NOW,
    expiresAt: '2026-09-02T13:00:00.000Z',
    ...overrides,
  });
}

function approvalFor(target: ActionIntent, overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: 'ap-1',
    workspaceId: target.workspaceId,
    objectType: 'action_intent',
    objectId: target.id,
    objectRevision: target.revision,
    decision: 'approved',
    requestedAt: NOW,
    requestedBy: 'agent',
    requestReason: target.summary,
    decidedBy: 'user',
    decidedAt: NOW,
    contentHash: target.contentHash,
    ...overrides,
  };
}

describe('default policy', () => {
  it('covers every action class exactly once', () => {
    expect(DEFAULT_POLICY_RULES.map((rule) => rule.actionClass).sort()).toEqual([...ACTION_CLASSES].sort());
  });

  it('allows local reads, analysis, sandbox writes, approved tests and drafts automatically', async () => {
    for (const actionClass of ['read', 'analyse', 'sandbox_write', 'test_run', 'draft'] as const) {
      const decision = decide(await intent(actionClass), DEFAULT_POLICY_RULES, [], NOW);
      expect(decision.effect, actionClass).toBe('allow');
      expect(decision.approvalId).toBeNull();
    }
  });

  it('requires a person for anything that leaves the sandbox or spends authority', async () => {
    for (const actionClass of ['external_draft', 'send', 'publish', 'merge', 'deploy', 'delete', 'spend', 'credential_change'] as const) {
      const decision = decide(await intent(actionClass), DEFAULT_POLICY_RULES, [], NOW);
      expect(decision.effect, actionClass).toBe('require_approval');
    }
  });

  it('denies bypassing a security control even with an approval on file', async () => {
    const bypass = await intent('security_bypass');
    const decision = decide(bypass, DEFAULT_POLICY_RULES, [approvalFor(bypass)], NOW);
    expect(decision.effect).toBe('deny');
    expect(decision.approvalId).toBeNull();
  });

  it('fails closed for an action class no rule covers', async () => {
    const unknown = await intent('teleport' as ActionClass);
    expect(decide(unknown, DEFAULT_POLICY_RULES, [], NOW).effect).toBe('deny');
    expect(decide(await intent('read'), [], [], NOW).effect).toBe('deny');
  });
});

describe('approval freshness', () => {
  it('accepts only an approved record bound to the same intent, revision and hash before expiry', async () => {
    const send = await intent('send');
    expect(isApprovalFresh(approvalFor(send), send, NOW)).toBe(true);
    expect(decide(send, DEFAULT_POLICY_RULES, [approvalFor(send)], NOW)).toMatchObject({ effect: 'allow', approvalId: 'ap-1' });

    expect(isApprovalFresh(approvalFor(send, { contentHash: '0'.repeat(64) }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { objectRevision: send.revision + 1 }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { objectId: 'ai-other' }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { decision: 'pending' }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { decision: 'rejected' }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { objectType: 'routine' }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send, { workspaceId: 'ws-other' }), send, NOW)).toBe(false);
    expect(isApprovalFresh(approvalFor(send), send, '2026-09-02T13:00:00.001Z')).toBe(false);

    const edited = { ...send, target: 'someone-else@example.com' };
    edited.contentHash = await computeIntentHash(edited);
    expect(isApprovalFresh(approvalFor(send), edited, NOW)).toBe(false);
    expect(decide(edited, DEFAULT_POLICY_RULES, [approvalFor(send)], NOW).effect).toBe('require_approval');
  });

  it('binds the intent hash to its content, not its timestamps', async () => {
    const a = await intent('publish', { id: 'ai-fixed' });
    const b = await intent('publish', { id: 'ai-fixed', requestedAt: '2026-09-02T12:30:00.000Z' });
    expect(a.contentHash).toBe(b.contentHash);
    const c = await intent('publish', { id: 'ai-fixed', target: 'other' });
    expect(c.contentHash).not.toBe(a.contentHash);
    expect(a.id).toMatch(/^ai-/);
  });
});

describe('approveIntent and recordPolicyDecision', () => {
  beforeEach(() => {
    freshDb();
  });

  it('lets only a person approve, binds the approval to the hash, and records the decision in proof', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Policy' }));
    const send = await intent('send', { workspaceId: workspace.id });
    const denied = await approveIntent(workspace.id, send, 'agent');
    expect(denied).toMatchObject({ ok: false, error: { code: 'approval_required' } });
    expect(await approveIntent(workspace.id, send, 'system')).toMatchObject({ ok: false, error: { code: 'approval_required' } });
    expect(await getDb().approvals.count()).toBe(0);

    const stale = { ...send, contentHash: '0'.repeat(64) };
    expect(await approveIntent(workspace.id, stale)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await approveIntent('ws-other', send)).toMatchObject({ ok: false, error: { code: 'validation' } });

    const approval = unwrap(await approveIntent(workspace.id, send, 'human', 'Send it'));
    expect(approval).toMatchObject({ objectType: 'action_intent', objectId: send.id, objectRevision: send.revision, contentHash: send.contentHash, decision: 'approved' });
    const approvals = await getDb().approvals.where('workspaceId').equals(workspace.id).toArray();
    expect(decide(send, DEFAULT_POLICY_RULES, approvals, NOW)).toMatchObject({ effect: 'allow', approvalId: approval.id });

    const recorded = unwrap(await recordPolicyDecision(workspace.id, send, decide(send, DEFAULT_POLICY_RULES, approvals, NOW)));
    expect(recorded.effect).toBe('allow');
    const events = await listProofEvents(workspace.id);
    const decided = events.filter((event) => event.type === 'policy.decided');
    expect(decided).toHaveLength(2);
    expect(decided[1]!.payload).toMatchObject({ intentId: send.id, effect: 'allow', actionClass: 'send' });
    expect((await recordPolicyDecision('ws-other', send, decide(send, DEFAULT_POLICY_RULES, [], NOW))).ok).toBe(false);
  });
});
