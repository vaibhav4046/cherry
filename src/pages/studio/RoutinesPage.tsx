import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { describeSchedule, draftRoutine, listApprovedSkillGraphs, listRoutines } from '../../cherry/workforce/routines-service.ts';
import type { Routine } from '../../cherry/workforce/workforce-model.ts';
import type { SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export default function RoutinesPage() {
  const { activeWorkspace } = useAppState();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [graphs, setGraphs] = useState<SkillGraph[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeWorkspace) return;
    const [loadedRoutines, loadedGraphs] = await Promise.all([
      listRoutines(activeWorkspace.id),
      listApprovedSkillGraphs(activeWorkspace.id),
    ]);
    setRoutines(loadedRoutines);
    setGraphs(loadedGraphs);
  }, [activeWorkspace]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const created = await draftRoutine({
      workspaceId: activeWorkspace.id,
      skillGraphId: String(form.get('skillGraphId') ?? ''),
    });
    setBusy(false);
    if (!created.ok) {
      setError(created.error.message);
      return;
    }
    await refresh();
  }

  if (!activeWorkspace) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Routines</h1>
        <p className="subhead">Create a workspace in the Command Center first — routines live inside it.</p>
        <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Open Command Center</Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm title-3d">Routines</h1>
        <p className="subhead" style={{ maxWidth: 680 }}>
          Schedule an approved skill to run on repeat. Every schedule change needs your re-approval.
          Runs on schedule while an approved local or cloud execution host is available.
        </p>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {graphs.length === 0 ? (
        <section className="card card-wash-lavender stack">
          <h2 className="subhead" style={{ fontSize: 20 }}>No approved skills yet</h2>
          <p style={{ margin: 0 }}>A routine runs an approved skill. Approve one in Skills first.</p>
          <Link to="/studio/skills" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Go to Skills</Link>
        </section>
      ) : (
        <form onSubmit={handleDraft} className="card stack" aria-labelledby="draft-heading" data-testid="routine-draft-form">
          <h2 id="draft-heading" className="subhead" style={{ fontSize: 20 }}>Draft a routine</h2>
          <div className="row">
            <label className="field">
              <span>Approved skill</span>
              <select className="select" name="skillGraphId" required defaultValue={graphs[0]?.id}>
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
            No routines yet. Draft one above, or <Link to="/studio/skills">approve a skill</Link> to get started.
          </p>
        ) : (
          <div className="event-strip">
            {routines.map((routine) => (
              <Link key={routine.id} to={`/studio/routines/${routine.id}`} className="event-row" style={{ textDecoration: 'none' }} data-testid="routine-row">
                <span className={routine.enabled ? 'sticker sticker-pass' : 'sticker sticker-wait'} style={{ padding: '2px 10px' }}>
                  {routine.enabled ? 'enabled' : 'disabled'}
                </span>
                <span style={{ fontWeight: 700 }}>{routine.name}</span>
                <span style={{ fontSize: 14 }}>{describeSchedule(routine.schedule)}</span>
                <span className="mono" style={{ fontSize: 13 }}>next {fmt(routine.nextRunAt)}</span>
                <span className="mono" style={{ fontSize: 13 }}>last {fmt(routine.lastRunAt)}</span>
                <span className="sticker" style={{ padding: '1px 8px', fontSize: 11 }}>{routine.executionHostId}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
