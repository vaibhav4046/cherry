import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createWorkspace } from '../../cherry/mission/mission-service.ts';
import { runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { createMission, listMissionCards, syncMission, type MissionCard } from '../../cherry/workforce/mission-control-service.ts';
import { MISSION_TEMPLATES } from '../../cherry/workforce/mission-templates.ts';
import { MissionCardView, missionStatusLabel } from './MissionCardView.tsx';

const EXAMPLE_OUTCOMES = [
  'Audit this repository and fix the highest-impact defect.',
  'Prepare today\u2019s creator content from my real project activity.',
  'Own my actionable inbox and leave consequential replies for review.',
  'Research this market and produce an evidence-backed launch brief.',
];

const SYNC_INTERVAL_MS = 5000;

type Column = MissionCard['column'];
const COLUMNS: Array<{ id: Column; title: string; empty: string }> = [
  { id: 'working', title: 'Working', empty: 'Nothing is running. Give Cherry an outcome above.' },
  { id: 'needs_you', title: 'Needs you', empty: 'Nothing is waiting on you.' },
  { id: 'completed', title: 'Completed', empty: 'No finished missions yet.' },
];

/**
 * Mission Control: outcome in, team out. Cards read persisted state only; the
 * visible sync toggle mirrors the paired runner on a stated interval.
 */
export default function MissionControl() {
  const { activeWorkspace, refresh, setActiveMission } = useAppState();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcome, setOutcome] = useState(() => searchParams.get('outcome') ?? '');
  const [templateId, setTemplateId] = useState('');
  const [repositoryRoot, setRepositoryRoot] = useState('');
  const [constraints, setConstraints] = useState('');
  const [cards, setCards] = useState<MissionCard[]>([]);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveSync, setLiveSync] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    const [loaded, status] = await Promise.all([listMissionCards(activeWorkspace.id), runnerStatus()]);
    setCards(loaded);
    setRunner(status);
  }, [activeWorkspace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!liveSync || !activeWorkspace) return;
    const timer = setInterval(() => {
      void (async () => {
        for (const card of cards) {
          if (card.runnerBound && card.column === 'working') await syncMission(activeWorkspace.id, card.missionId);
        }
        await load();
      })();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [liveSync, activeWorkspace, cards, load]);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await createWorkspace({ name: String(form.get('name') ?? '').trim() });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    setError(null);
    setBusy(true);
    const result = await createMission({
      workspaceId: activeWorkspace.id,
      outcome,
      ...(templateId ? { templateId } : {}),
      repositoryRoot: repositoryRoot.trim() || null,
      constraints: constraints.split('\n').map((line) => line.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setActiveMission(result.value.mission.id);
    if (searchParams.get('outcome')) setSearchParams({}, { replace: true });
    navigate(`/studio/control/${result.value.mission.id}`);
  }

  if (!activeWorkspace) {
    return (
      <div className="empty-state" data-testid="control-empty">
        <h1 className="display-sm">Missions</h1>
        <p className="subhead" style={{ maxWidth: 520 }}>Name a space first. Everything Cherry plans stays in this browser until you export it.</p>
        <form onSubmit={handleCreateWorkspace} className="row" style={{ justifyContent: 'center' }}>
          <label className="field" style={{ minWidth: 260 }}>
            <span>Space name</span>
            <input className="input" name="name" required maxLength={120} placeholder="My missions" />
          </label>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>Create space</button>
        </form>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  const runnerLine = runner === null
    ? 'Checking for a paired runner.'
    : runner.reachable && runner.paired
      ? 'Runner paired. Missions run while this computer and the runner are online.'
      : runner.reachable
        ? 'Runner found but not paired. Pair it in Connections to start missions.'
        : 'No runner detected. You can plan missions now; starting one needs the local runner.';

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }} data-testid="mission-control">
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <h1 className="display-sm">What should Cherry take care of?</h1>
        <p className="subhead" style={{ margin: 0, maxWidth: 640 }}>
          Describe the result. Cherry plans the team, gives each worker its own workspace, checks the work, and asks only when your authority is needed.
        </p>
      </header>

      <form onSubmit={handlePlan} className="card stack" style={{ gap: 'var(--sp-4)' }} data-testid="outcome-composer">
        <label className="field">
          <span>Outcome</span>
          <textarea
            className="textarea"
            name="outcome"
            rows={3}
            required
            minLength={8}
            maxLength={2000}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="Audit this repository and fix the highest-impact defect."
            data-testid="outcome-input"
          />
        </label>
        <div className="row" role="group" aria-label="Example outcomes">
          {EXAMPLE_OUTCOMES.map((example) => (
            <button key={example} type="button" className="btn btn-sm" onClick={() => setOutcome(example)}>{example}</button>
          ))}
        </div>
        <div className="row">
          <label className="field">
            <span>Plan template</span>
            <select className="select" value={templateId} onChange={(event) => setTemplateId(event.target.value)} data-testid="template-select">
              <option value="">Choose from the outcome</option>
              {MISSION_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Repository folder (optional, must be under a runner root)</span>
            <input className="input" value={repositoryRoot} onChange={(event) => setRepositoryRoot(event.target.value)} placeholder="D:\project\example" data-testid="repository-input" />
          </label>
        </div>
        <label className="field">
          <span>Constraints, one per line (optional)</span>
          <textarea className="textarea" rows={2} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Nothing public without approval." />
        </label>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label" data-testid="runner-line">{runnerLine}</span>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy} data-testid="plan-mission">{busy ? 'Planning' : 'Plan the mission'}</button>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </form>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="subhead" style={{ margin: 0 }}>Missions</h2>
        <div className="row">
          <label className="row" style={{ gap: 'var(--sp-2)' }}>
            <input type="checkbox" checked={liveSync} onChange={(event) => setLiveSync(event.target.checked)} data-testid="live-sync" />
            <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>Sync from the paired runner every 5 seconds</span>
          </label>
          <button type="button" className="btn btn-sm" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      <div className="grid-cards" data-testid="mission-columns">
        {COLUMNS.map((column) => {
          const items = cards.filter((card) => card.column === column.id);
          return (
            <section key={column.id} className="card stack" aria-labelledby={`column-${column.id}`} data-testid={`column-${column.id}`}>
              <h3 id={`column-${column.id}`} className="subhead" style={{ margin: 0 }}>{column.title} <span className="label tnum">{items.length}</span></h3>
              {items.length === 0 ? <p style={{ margin: 0 }}>{column.empty}</p> : items.map((card) => <MissionCardView key={card.planId} card={card} />)}
            </section>
          );
        })}
      </div>

      <p className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
        Status words: {missionStatusLabel('running')} means a worker holds a lease on your runner; {missionStatusLabel('succeeded')} means every required check passed.
        <Link to="/studio/agent" className="link-quiet" style={{ marginLeft: 'var(--sp-2)' }}>See what a connected agent can do here</Link>
      </p>
    </div>
  );
}
