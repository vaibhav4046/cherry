import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { listProofEvents } from '../../cherry/persistence/transactions.ts';
import type { ProofEvent } from '../../cherry/core/domain-event.ts';
import { CopyButton } from '../../components/Icons.tsx';
import {
  approveMissionPlan,
  cancelMission,
  decideMissionNode,
  getMissionView,
  startMission,
  syncMission,
  type MissionNodeView,
  type MissionView,
} from '../../cherry/workforce/mission-control-service.ts';
import type { PlanNodeRunStatus } from '../../cherry/workforce/mission-plan-model.ts';
import { buildCodexAutomationRecipe, buildWorkTaskRecipe, renderRecipeText } from '../../cherry/workforce/automation-recipes.ts';
import { missionStatusClass, missionStatusLabel } from './MissionCardView.tsx';
import { LiveStartGate } from '../../components/studio/mission-control/LiveStartGate.tsx';

const NODE_LABEL: Record<PlanNodeRunStatus, string> = {
  pending: 'Waiting',
  ready: 'Queued',
  running: 'Running',
  verifying: 'Checking',
  waiting_for_human: 'Needs you',
  succeeded: 'Done',
  failed: 'Failed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const NODE_CLASS: Record<PlanNodeRunStatus, string> = {
  pending: 'sticker',
  ready: 'sticker sticker-blue',
  running: 'sticker sticker-cherry',
  verifying: 'sticker sticker-blue',
  waiting_for_human: 'sticker sticker-wait',
  succeeded: 'sticker sticker-pass',
  failed: 'sticker sticker-fail',
  blocked: 'sticker sticker-fail',
  cancelled: 'sticker',
};

const SYNC_INTERVAL_MS = 5000;

function NodeRow({ view, onDecide, deciding }: { view: MissionNodeView; onDecide: (nodeId: string, decision: 'approved' | 'rejected') => void; deciding: boolean }) {
  const { node, status, runner } = view;
  const boundary = runner?.sandbox?.boundary ?? (node.kind === 'human_decision' ? 'human decision' : node.sandbox === 'none' ? 'process' : 'allocated at start');
  return (
    <li className="stack" style={{ border: 'var(--border)', borderRadius: 'var(--radius-cards)', padding: 'var(--sp-3)', gap: 'var(--sp-2)' }} data-testid="mission-node" data-node-id={node.id} data-node-status={status}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{node.title}</strong>
        <span className={NODE_CLASS[status]}>{NODE_LABEL[status]}</span>
      </div>
      <p style={{ margin: 0, fontSize: 14 }}>{node.objective}</p>
      <div className="row" style={{ gap: 'var(--sp-3)', fontSize: 13 }}>
        <span>{runner?.host ? `${runner.host.kind}${runner.host.version ? ` ${runner.host.version}` : ''}` : node.preferredHostKinds.length > 0 ? `prefers ${node.preferredHostKinds.join(' or ')}` : 'any capable host'}</span>
        <span className="mono">{boundary}</span>
        {node.dependencyIds.length > 0 ? <span>after {node.dependencyIds.join(', ')}</span> : <span>starts immediately</span>}
        {runner ? <span className="tnum">attempt {runner.attempts} of {node.maxAttempts}</span> : null}
      </div>
      {runner?.sandbox ? <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>Workspace: {runner.sandbox.root}{runner.sandbox.branchName ? ` on ${runner.sandbox.branchName}` : ''}{runner.sandbox.baseCommit ? ` from ${runner.sandbox.baseCommit.slice(0, 10)}` : ''}</span> : null}
      {runner?.evaluation ? (
        <ul style={{ margin: 0, paddingLeft: 'var(--sp-5)', fontSize: 13 }} data-testid="node-checks">
          {runner.evaluation.checks.map((check) => (
            <li key={check.id}>
              <span className={check.status === 'passed' ? 'sticker sticker-pass' : check.status === 'failed' ? 'sticker sticker-fail' : 'sticker sticker-wait'} style={{ padding: '1px 6px', marginRight: 6 }}>{check.status}</span>
              {check.name}{check.detail ? `: ${check.detail}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {runner?.lastError ? <p className="field-error" style={{ margin: 0 }}>{runner.lastError}</p> : null}
      {node.kind === 'human_decision' && status === 'waiting_for_human' ? (
        <div className="row">
          <button type="button" className="btn btn-sm btn-primary" disabled={deciding} onClick={() => onDecide(node.id, 'approved')} data-testid="decide-approve">Approve this exact plan</button>
          <button type="button" className="btn btn-sm btn-danger" disabled={deciding} onClick={() => onDecide(node.id, 'rejected')} data-testid="decide-reject">Reject</button>
        </div>
      ) : null}
    </li>
  );
}

/** One mission: graph, teammates, checks, approvals, activity, handoff recipes. */
export default function MissionControlDetail() {
  const { missionId } = useParams<{ missionId: string }>();
  const { activeWorkspace } = useAppState();
  const [view, setView] = useState<MissionView | null>(null);
  const [events, setEvents] = useState<ProofEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveSync, setLiveSync] = useState(false);
  const [recipe, setRecipe] = useState<string | null>(null);
  // Only agent nodes need an eligible host. Verify nodes run the runner's own deterministic checks
  // (their 'verification' capability is runner-native, never advertised by a host) and human
  // decisions are made in this UI, so neither may gate the live start.
  const requiredCapabilitySets = useMemo(
    () => view?.plan.nodes
      .filter((node) => node.kind === 'agent')
      .map((node) => node.requiredCapabilities) ?? [],
    [view],
  );

  const load = useCallback(async () => {
    if (!activeWorkspace || !missionId) return;
    const result = await getMissionView(activeWorkspace.id, missionId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setView(result.value);
    const ids = new Set<string>([missionId, result.value.plan.id, ...Object.values(result.value.plan.nodeWorkItemIds)]);
    const all = await listProofEvents(activeWorkspace.id, 400);
    setEvents(all.filter((event) => ids.has(event.objectId)).slice(-20).reverse());
  }, [activeWorkspace, missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!liveSync || !activeWorkspace || !missionId) return;
    const timer = setInterval(() => {
      void (async () => {
        await syncMission(activeWorkspace.id, missionId);
        await load();
      })();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [liveSync, activeWorkspace, missionId, load]);

  async function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error?.message ?? 'The action failed.');
    else setNotice(success);
    await load();
  }

  if (!activeWorkspace || !missionId) return <p className="empty-state">No space is active. <Link to="/studio/control">Open Missions</Link>.</p>;
  if (!view) return <div className="empty-state" role="status" aria-live="polite">{error ? <p className="field-error">{error}</p> : <span className="sticker sticker-cherry">Loading the mission</span>}</div>;

  const { plan, card, nodes, binding } = view;
  const workspaceId = activeWorkspace.id;
  const canStart = ['draft', 'validated', 'ready', 'failed'].includes(plan.status);
  const canCancel = !['succeeded', 'cancelled'].includes(plan.status);
  const needsPlanApproval = card.requiresApproval && !card.approved;

  async function decide(nodeId: string, decision: 'approved' | 'rejected') {
    if (!view) return;
    await run(async () => {
      let approvalId = view.plan.approvalId;
      if (decision === 'approved' && !approvalId) {
        const approved = await approveMissionPlan(workspaceId, view.plan.id, view.plan.revision, 'human');
        if (!approved.ok) return approved;
        approvalId = approved.value.approvalId;
      }
      return decideMissionNode(workspaceId, missionId!, nodeId, decision, approvalId, 'human');
    }, decision === 'approved' ? 'Decision recorded at this exact plan revision.' : 'Rejected. The mission stops here.');
  }

  const recipeSource = { missionId, outcome: plan.outcome, constraints: plan.constraints, approvalBoundaries: ['Public actions need my approval.'], repositoryRoot: null, skillId: null };

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }} data-testid="mission-detail">
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <Link to="/studio/control" className="link-quiet">Missions</Link>
        <h1 className="display-sm">{plan.outcome}</h1>
        <div className="row">
          <span className={missionStatusClass(card.status)} data-testid="mission-status">{missionStatusLabel(card.status)}</span>
          <span className="sticker tnum">plan r{plan.revision}</span>
          <span className="sticker mono" title="Content hash of this exact plan">{plan.contentHash.slice(0, 12)}</span>
          {card.approved ? <span className="sticker sticker-pass">Approved at r{plan.revision}</span> : card.requiresApproval ? <span className="sticker sticker-wait">Needs your approval before it starts</span> : null}
          {binding ? <span className="sticker">Runner {binding.missionRunId.slice(0, 14)}</span> : <span className="sticker">Not on a runner yet</span>}
        </div>
      </header>

      <div className="row" data-testid="mission-actions">
        {needsPlanApproval ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => approveMissionPlan(workspaceId, plan.id, plan.revision, 'human'), 'Plan approved at this exact revision.')} data-testid="approve-plan">Approve plan r{plan.revision}</button>
        ) : null}
        <LiveStartGate
          canStart={canStart && view.problems.length === 0}
          policyAllows={!needsPlanApproval}
          requiredCapabilitySets={requiredCapabilitySets}
          busy={busy}
          onStart={() => void run(() => startMission(workspaceId, missionId, plan.revision), 'Started on your paired runner.')}
        />
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => syncMission(workspaceId, missionId), binding ? 'Synced from the runner.' : 'Nothing to sync. This mission is not on a runner.')} data-testid="sync-mission">Sync now</button>
        {canCancel ? <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(() => cancelMission(workspaceId, missionId, 'human'), 'Cancelled.')} data-testid="cancel-mission">Cancel</button> : null}
        <label className="row" style={{ gap: 'var(--sp-2)' }}>
          <input type="checkbox" checked={liveSync} onChange={(event) => setLiveSync(event.target.checked)} data-testid="live-sync" />
          <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>Sync every 5 seconds</span>
        </label>
      </div>
      {error ? <p className="field-error" role="alert" data-testid="mission-error">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}
      {view.problems.length > 0 ? <p className="field-error" role="alert">The plan has problems: {view.problems.join('; ')}</p> : null}

      <section className="card stack" aria-labelledby="graph-heading">
        <h2 id="graph-heading" className="subhead" style={{ margin: 0 }}>The team and its work</h2>
        <p style={{ margin: 0, fontSize: 14 }}>{card.activeWorkers} working now · hosts {card.hosts.join(', ') || 'chosen at start'} · boundaries {card.boundaries.join(', ') || 'allocated at start'}</p>
        <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="mission-graph">
          {nodes.map((node) => <NodeRow key={node.node.id} view={node} onDecide={(nodeId, decision) => void decide(nodeId, decision)} deciding={busy} />)}
        </ol>
      </section>

      <section className="card stack" aria-labelledby="handoff-heading">
        <h2 id="handoff-heading" className="subhead" style={{ margin: 0 }}>Run it somewhere else</h2>
        <p style={{ margin: 0, fontSize: 14 }}>Cherry writes the recipe. You create the task in the host. Each recipe states where it actually runs.</p>
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setRecipe(renderRecipeText(buildWorkTaskRecipe(recipeSource, { kind: 'schedule', description: 'every weekday at 08:00' })))} data-testid="recipe-work">Run with ChatGPT Work</button>
          <button type="button" className="btn btn-sm" onClick={() => setRecipe(renderRecipeText(buildCodexAutomationRecipe(recipeSource, 'every weekday at 08:00')))} data-testid="recipe-codex">Run as Codex Automation</button>
        </div>
        {recipe ? (
          <div className="stack">
            <CopyButton text={recipe} label="Copy the recipe" />
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--color-paper-white)', border: 'var(--border)', borderRadius: 8, padding: 12 }} data-testid="recipe-text">{recipe}</pre>
          </div>
        ) : null}
      </section>

      <section className="stack" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="subhead" style={{ margin: 0 }}>Activity</h2>
        {events.length === 0 ? <p style={{ margin: 0 }}>No events for this mission yet.</p> : (
          <div className="event-strip" data-testid="mission-activity">
            {events.map((event) => (
              <div key={event.id} className="event-row">
                <span className="mono">#{event.sequence}</span>
                <span className="mono">{event.occurredAt.slice(11, 19)}</span>
                <span className="sticker" style={{ padding: '2px 8px' }}>{event.actorType}</span>
                <span>{event.summary}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
