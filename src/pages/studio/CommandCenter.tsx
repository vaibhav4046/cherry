import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { startTour } from '../../components/GuidedTour.tsx';
import { createWorkspace } from '../../cherry/mission/mission-service.ts';
import { listProofEvents } from '../../cherry/persistence/transactions.ts';
import { listApprovals, decideSkillGraphApproval } from '../../cherry/skillgraph/skillgraph-service.ts';
import { listMemories } from '../../cherry/memory/memory-service.ts';
import { listRuns } from '../../cherry/mission/mission-service.ts';
import { runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { exportWorkspace, importWorkspace } from '../../cherry/persistence/workspace-archive.ts';
import type { ProofEvent } from '../../cherry/core/domain-event.ts';
import type { ApprovalRecord } from '../../cherry/approval/approval-model.ts';
import { CherryMascot } from '../../components/CherryMascot.tsx';

export default function CommandCenter() {
  const { activeWorkspace, activeMission, missions, refresh, setActiveMission, setActiveWorkspace } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const entryHandledRef = useRef(false);
  const [events, setEvents] = useState<ProofEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [memoryInboxCount, setMemoryInboxCount] = useState(0);
  const [attentionRuns, setAttentionRuns] = useState(0);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspace) return;
      const [loadedEvents, loadedApprovals, inbox, runs, runnerState] = await Promise.all([
        listProofEvents(activeWorkspace.id, 12),
        listApprovals(activeWorkspace.id),
        listMemories(activeWorkspace.id, { status: 'proposed' }),
        listRuns(activeWorkspace.id),
        runnerStatus(),
      ]);
      if (cancelled) return;
      setEvents(loadedEvents.reverse());
      setApprovals(loadedApprovals.filter((approval) => approval.decision === 'pending'));
      setMemoryInboxCount(inbox.length);
      setAttentionRuns(runs.filter((run) => run.status === 'failed' || run.status === 'waiting_for_runner').length);
      setRunner(runnerState);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, activeMission]);

  // Landing CTA entries. demo=1: load the guided example and start the tour.
  // teach=1: go straight to the first-mission form once a workspace exists.
  useEffect(() => {
    if (entryHandledRef.current) return;
    const wantsDemo = searchParams.get('demo') === '1';
    const wantsTeach = searchParams.get('teach') === '1';
    if (!wantsDemo && !wantsTeach) return;

    if (wantsTeach && activeWorkspace) {
      entryHandledRef.current = true;
      setSearchParams({}, { replace: true });
      navigate('/studio/quick');
      return;
    }
    if (wantsDemo) {
      entryHandledRef.current = true;
      setSearchParams({}, { replace: true });
      void (async () => {
        // Reuse an already-imported example instead of importing twice.
        const alreadyExample = activeWorkspace?.isExample === true;
        if (!alreadyExample) {
          await handleImportExample();
        }
        startTour();
      })();
    }
  }, [searchParams, activeWorkspace, setSearchParams, navigate]);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const result = await createWorkspace({ name });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await refresh();
    if (searchParams.get('teach') === '1') {
      setSearchParams({}, { replace: true });
      navigate('/studio/quick');
    }
  }

  async function handleDecision(approval: ApprovalRecord, decision: 'approved' | 'rejected') {
    setError(null);
    const result = await decideSkillGraphApproval(approval.id, decision, 'user');
    if (!result.ok) setError(result.error.message);
    await refresh();
    if (activeWorkspace) {
      setApprovals((await listApprovals(activeWorkspace.id)).filter((entry) => entry.decision === 'pending'));
    }
  }

  async function handleExport() {
    if (!activeWorkspace) return;
    const result = await exportWorkspace(activeWorkspace.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cherry-workspace-${activeWorkspace.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Workspace exported (hash ${result.value.integrity.payloadSha256.slice(0, 12)}…).`);
  }

  async function handleImportFile(file: File) {
    setError(null);
    const text = await file.text();
    const result = await importWorkspace(text);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setNotice(`Imported "${result.value.name}" (hash ${result.value.hashVerified ? 'verified' : 'absent'}).`);
    await refresh();
  }

  async function handleImportExample() {
    setError(null);
    try {
      const response = await fetch('/examples/example-workspace.json');
      if (!response.ok) throw new Error(`example not found (${response.status})`);
      const text = await response.text();
      const result = await importWorkspace(text, { markExample: true });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotice(`Example workspace loaded (hash ${result.value.hashVerified ? 'verified' : 'absent'}). Delete it anytime from Connections.`);
      setActiveWorkspace(result.value.workspaceId);
      await refresh();
    } catch (fetchError) {
      setError(`Could not load the example workspace: ${(fetchError as Error).message}`);
    }
  }

  if (!activeWorkspace) {
    return (
      <div className="empty-state">
        <CherryMascot pose="present" size={150} line="Hi! Give me a workspace and teach me a workflow — I will keep the receipts." />
        <h1 className="display-sm title-3d">Teach Cherry something</h1>
        <p className="subhead" style={{ maxWidth: 520 }}>
          Create a local workspace. Everything stays in this browser until you export it.
        </p>
        <form onSubmit={handleCreateWorkspace} className="row" style={{ justifyContent: 'center' }}>
          <label className="field" style={{ minWidth: 260 }}>
            <span>Workspace name</span>
            <input className="input" name="name" required maxLength={120} placeholder="My first workspace" />
          </label>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            Create workspace
          </button>
        </form>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className="label">Or bring an exported workspace</span>
          <div className="row" style={{ justifyContent: 'center' }}>
            <label className="btn">
              Import workspace JSON
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void handleImportFile(file);
                }}
              />
            </label>
            <button type="button" className="btn" onClick={() => void handleImportExample()}>
              Load the example workspace
            </button>
          </div>
          <span className="label" style={{ maxWidth: 420 }}>
            The example is a real exported workspace produced by Cherry operations. It is clearly labelled,
            isolated from your data, and deletable.
          </span>
          {notice ? <p className="sticker sticker-pass">{notice}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="display-sm title-3d">Command Center</h1>
        <div className="row">
          <Link to="/studio/quick" className="btn btn-primary">Quick skill from a video</Link>
          <Link to="/studio/missions/new" className="btn">Create mission</Link>
          <button type="button" className="btn" onClick={() => startTour()} data-testid="replay-walkthrough">
            Replay walkthrough
          </button>
          <button type="button" className="btn" onClick={() => void handleExport()}>Export workspace</button>
          <label className="btn">
            Import
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
          </label>
        </div>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      <div className="grid-cards">
        <section className="card card-wash-cherry stack" aria-labelledby="missions-heading">
          <h2 id="missions-heading" className="subhead">Missions</h2>
          {missions.length === 0 ? (
            <>
              <p>No missions yet. A mission gives your agent an objective and a definition of done.</p>
              <Link to="/studio/missions/new" className="btn">Create your first mission</Link>
            </>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {missions.map((mission) => (
                <li key={mission.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <Link
                    to={`/studio/missions/${mission.id}`}
                    onClick={() => setActiveMission(mission.id)}
                    style={{ fontWeight: 700 }}
                  >
                    {mission.title}
                  </Link>
                  <span className="sticker">{mission.state}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack" aria-labelledby="approvals-heading">
          <h2 id="approvals-heading" className="subhead">Pending approvals</h2>
          {approvals.length === 0 ? (
            <p>Nothing waiting on you. When an agent requests a checkpoint, it appears here.</p>
          ) : (
            approvals.map((approval) => (
              <div key={approval.id} className="stack" style={{ border: 'var(--border)', borderRadius: 'var(--radius-sticker)', padding: 'var(--sp-3)' }}>
                <span className="label">
                  {approval.objectType} · version {approval.objectRevision}
                </span>
                <p style={{ margin: 0 }}>{approval.requestReason}</p>
                <div className="row">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleDecision(approval, 'approved')}>
                    Approve r{approval.objectRevision}
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDecision(approval, 'rejected')}>
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="card card-wash-lavender stack" aria-labelledby="inbox-heading">
          <h2 id="inbox-heading" className="subhead">Memory Inbox</h2>
          <p>
            {memoryInboxCount === 0
              ? 'No proposed memories waiting. Nothing becomes memory without your approval.'
              : `${memoryInboxCount} proposed ${memoryInboxCount === 1 ? 'memory' : 'memories'} awaiting your decision.`}
          </p>
          <Link to="/studio/memory" className="btn btn-sm">Open Memory Vault</Link>
        </section>

        <section className="card stack" aria-labelledby="runner-heading">
          <h2 id="runner-heading" className="subhead">Local runner</h2>
          {runner === null ? (
            <p>Checking…</p>
          ) : runner.reachable && runner.paired ? (
            <p className="sticker sticker-pass">Paired · queue {runner.queueDepth ?? 0}</p>
          ) : runner.reachable ? (
            <p className="sticker sticker-wait">Runner found · not paired</p>
          ) : (
            <p>
              No runner detected on this machine. The Studio is fully usable without one; a runner adds
              scheduled deterministic jobs. See Connections for setup.
            </p>
          )}
          {attentionRuns > 0 ? (
            <Link to="/studio/runs" className="btn btn-sm">
              {attentionRuns} run{attentionRuns === 1 ? '' : 's'} need attention
            </Link>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="events-heading" className="stack">
        <h2 id="events-heading" className="subhead">Proof event strip</h2>
        {events.length === 0 ? (
          <p className="card">No events yet. Every important action lands here as an append-only record.</p>
        ) : (
          <div className="event-strip" aria-live="polite">
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
