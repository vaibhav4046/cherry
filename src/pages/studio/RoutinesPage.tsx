import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { describeSchedule, draftRoutine, listApprovedSkillGraphs, listRoutines } from '../../cherry/workforce/routines-service.ts';
import type { Routine } from '../../cherry/workforce/workforce-model.ts';
import type { SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';
import { plainRoutineMessage } from './routine-copy.ts';

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export default function RoutinesPage() {
  const { ready, workspaces, activeWorkspace, setActiveWorkspace } = useAppState();
  const [searchParams] = useSearchParams();
  const requestedWorkspaceId = searchParams.get('workspaceId')?.trim() || null;
  const requestedSkillGraphId = searchParams.get('skillGraphId')?.trim() || null;
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [graphs, setGraphs] = useState<SkillGraph[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [createdGraphIds, setCreatedGraphIds] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadRequestRef = useRef(0);
  const prefillHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedPrefillRef = useRef<string | null>(null);

  const requestedWorkspaceExists = requestedWorkspaceId
    ? workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
    : true;
  const switchingWorkspace = Boolean(
    ready && requestedWorkspaceId && requestedWorkspaceExists && activeWorkspace?.id !== requestedWorkspaceId,
  );

  useEffect(() => {
    if (!ready || !requestedWorkspaceId || activeWorkspace?.id === requestedWorkspaceId) return;
    if (!requestedWorkspaceExists) {
      loadRequestRef.current += 1;
      setLoading(false);
      setCreatedGraphIds(new Set());
      setPrefillError('That skill is not available in this browser. Open the Library and choose an available skill.');
      return;
    }
    setGraphs([]);
    setLoading(true);
    setLoadError(null);
    setCreatedGraphIds(new Set());
    setPrefillError(null);
    setActiveWorkspace(requestedWorkspaceId);
  }, [activeWorkspace?.id, ready, requestedWorkspaceExists, requestedWorkspaceId, setActiveWorkspace]);

  const refresh = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!activeWorkspace) return;
    if (requestedWorkspaceId && activeWorkspace.id !== requestedWorkspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedRoutines, loadedGraphs] = await Promise.all([
        listRoutines(activeWorkspace.id),
        listApprovedSkillGraphs(activeWorkspace.id),
      ]);
      if (loadRequestRef.current !== requestId) return;
      setRoutines(loadedRoutines);
      setGraphs(loadedGraphs);
      if (requestedSkillGraphId) {
        const requestedGraph = loadedGraphs.find((graph) => graph.id === requestedSkillGraphId);
        if (!requestedGraph) {
          setSelectedGraphId('');
          setPrefillError('This skill is no longer approved at its current version. Review it in the Library before drafting a routine.');
          return;
        }
        setSelectedGraphId(requestedGraph.id);
        setPrefillError(null);
        return;
      }
      setSelectedGraphId((current) => loadedGraphs.some((graph) => graph.id === current) ? current : (loadedGraphs[0]?.id ?? ''));
      setPrefillError(null);
    } catch {
      if (loadRequestRef.current !== requestId) return;
      setGraphs([]);
      setSelectedGraphId('');
      setLoadError('Cherry could not load your routines from this browser. Try again.');
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [activeWorkspace, requestedSkillGraphId, requestedWorkspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId) ?? null;
  const prefillKey = requestedWorkspaceId && requestedSkillGraphId && selectedGraph?.id === requestedSkillGraphId
    ? `${requestedWorkspaceId}:${requestedSkillGraphId}`
    : null;

  useEffect(() => {
    if (!prefillKey) {
      focusedPrefillRef.current = null;
      return;
    }
    if (loading || loadError || prefillError || focusedPrefillRef.current === prefillKey) return;
    focusedPrefillRef.current = prefillKey;
    const frame = requestAnimationFrame(() => prefillHeadingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [loadError, loading, prefillError, prefillKey]);

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace || !selectedGraphId) return;
    setError(null);
    setBusy(true);
    const created = await draftRoutine({
      workspaceId: activeWorkspace.id,
      skillGraphId: selectedGraphId,
    });
    setBusy(false);
    if (!created.ok) {
      setError(plainRoutineMessage(created.error.message));
      return;
    }
    await refresh();
    setCreatedGraphIds((current) => new Set(current).add(selectedGraphId));
  }

  if (!ready || switchingWorkspace) {
    return <p className="card" role="status">Opening your routines.</p>;
  }

  if (!activeWorkspace) {
    if (prefillError) {
      return (
        <section className="card stack">
          <p className="field-error" role="alert" style={{ margin: 0 }}>{prefillError}</p>
          <Link to="/studio/skills" className="btn" style={{ alignSelf: 'flex-start' }}>Back to Skills</Link>
        </section>
      );
    }
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Routines</h1>
        <p className="subhead">Create your space in the Command Center before adding a routine.</p>
        <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Open Command Center</Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm title-3d">Routines</h1>
        <p className="subhead" style={{ maxWidth: 680 }}>
          Bind an approved skill to a manual runner request. Timed schedules can be saved as drafts, but runner registration is not connected yet.
        </p>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {prefillError ? (
        <section className="card stack">
          <p className="field-error" role="alert" style={{ margin: 0 }}>{prefillError}</p>
          <Link to="/studio/skills" className="btn" style={{ alignSelf: 'flex-start' }}>Back to Skills</Link>
        </section>
      ) : loading ? (
        <section className="card" role="status">Loading your routines.</section>
      ) : loadError ? (
        <section className="card stack">
          <p className="field-error" role="alert" style={{ margin: 0 }}>{loadError}</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void refresh()}>Try again</button>
        </section>
      ) : graphs.length === 0 ? (
        <section className="card card-wash-lavender stack">
          <h2 className="subhead" style={{ fontSize: 20 }}>No approved skills yet</h2>
          <p style={{ margin: 0 }}>A routine runs an approved skill. Approve one in Skills first.</p>
          <Link to="/studio/skills" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Go to Skills</Link>
        </section>
      ) : (
        <form onSubmit={handleDraft} className="card stack" aria-labelledby="draft-heading" data-testid="routine-draft-form">
          <h2 id="draft-heading" ref={prefillHeadingRef} tabIndex={prefillKey ? -1 : undefined} className="subhead" style={{ fontSize: 20 }}>Draft a routine</h2>
          {createdGraphIds.has(selectedGraphId) ? (
            <p className="quiet" role="status" style={{ margin: 0 }}>
              Routine draft created. Approve its manual version to use Run now.
            </p>
          ) : prefillKey && selectedGraph ? (
            <p className="quiet" role="status" style={{ margin: 0 }}>
              {selectedGraph.name} is approved exactly as you read it at r{selectedGraph.revision}. Nothing has been created yet.
            </p>
          ) : null}
          <div className="row">
            <label className="field">
              <span>Approved skill</span>
              <select className="select" name="skillGraphId" required value={selectedGraphId} onChange={(event) => setSelectedGraphId(event.currentTarget.value)}>
                {graphs.map((graph) => (
                  <option key={graph.id} value={graph.id}>
                    {graph.name} (approved r{graph.approvedRevision ?? graph.revision})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-end' }} data-testid="routine-draft-submit">
              {busy ? 'Drafting…' : 'Draft routine'}
            </button>
          </div>
        </form>
      )}

      <section className="stack" aria-labelledby="routines-heading">
        <h2 id="routines-heading" className="subhead" style={{ fontSize: 20 }}>Your routines ({routines.length})</h2>
        {routines.length === 0 ? (
          <p className="card">
            No routines yet. Choose an approved skill above to create one.
          </p>
        ) : (
          <div className="event-strip">
            {routines.map((routine) => (
              <Link key={routine.id} to={`/studio/routines/${routine.id}`} className="event-row" style={{ textDecoration: 'none' }} data-testid="routine-row">
                <span className={routine.enabled ? 'sticker sticker-pass' : 'sticker sticker-wait'} style={{ padding: '2px 10px' }}>
                  {routine.enabled ? 'manual ready' : routine.schedule.kind === 'manual' ? 'disabled' : 'timed draft'}
                </span>
                <span style={{ fontWeight: 700 }}>{routine.name}</span>
                <span style={{ fontSize: 14 }}>{describeSchedule(routine.schedule)}</span>
                <span className="mono" style={{ fontSize: 13 }}>{routine.schedule.kind === 'manual' ? 'next' : 'preview'} {fmt(routine.nextRunAt)}</span>
                <span className="mono" style={{ fontSize: 13 }}>last {fmt(routine.lastRunAt)}</span>
                <span className="sticker" style={{ padding: '1px 8px', fontSize: 11 }}>
                  {routine.executionHostId === 'local-runner' ? 'local runner' : 'paired runner'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="card stack" aria-label="Run on your computer">
        <h2 className="subhead" style={{ fontSize: 20 }}>Run on your computer</h2>
        <p style={{ margin: 0 }}>Manual Run now requests wait for your paired local runner. Timed execution is not registered, and nothing runs in Cherry's cloud.</p>
        <Link className="btn btn-sm" to="/studio/settings/connections" style={{ alignSelf: 'flex-start' }}>Check runner status</Link>
      </section>
    </div>
  );
}
