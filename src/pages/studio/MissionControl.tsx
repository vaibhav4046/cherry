import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createWorkspace } from '../../cherry/mission/mission-service.ts';
import { runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { createMission, listMissionCards, syncMission, type MissionCard } from '../../cherry/workforce/mission-control-service.ts';
import { MISSION_TEMPLATES } from '../../cherry/workforce/mission-templates.ts';
import { MissionCardView, missionStatusLabel } from './MissionCardView.tsx';
import '../../components/studio/mission-control/MissionControl.css';

const SYNC_INTERVAL_MS = 5000;

type Column = MissionCard['column'];
const COLUMNS: Array<{ id: Column; title: string; empty: string }> = [
  { id: 'working', title: 'Working', empty: 'Nothing is running.' },
  { id: 'needs_you', title: 'Needs you', empty: 'Nothing is waiting on you.' },
  { id: 'completed', title: 'Completed', empty: 'No finished missions yet.' },
];

/** Mission Control: one outcome becomes a durable, reviewable plan. */
export default function MissionControl() {
  const { ready, activeWorkspace, refresh, setActiveWorkspace, setActiveMission } = useAppState();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcome, setOutcome] = useState(() => searchParams.get('outcome') ?? '');
  const [templateId, setTemplateId] = useState('');
  const [repositoryRoot, setRepositoryRoot] = useState('');
  const [constraints, setConstraints] = useState('');
  const [cards, setCards] = useState<MissionCard[]>([]);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [runnerChecking, setRunnerChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveSync, setLiveSync] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace) {
      setCards([]);
      return;
    }
    setCards(await listMissionCards(activeWorkspace.id));
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

  async function checkRunner() {
    if (runnerChecking || runner) return;
    setRunnerChecking(true);
    setRunner(await runnerStatus());
    setRunnerChecking(false);
  }

  async function handlePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    const trimmedOutcome = outcome.trim();
    if (trimmedOutcome.length < 8) {
      setError('Describe the result in at least a short sentence.');
      return;
    }
    if (trimmedOutcome.length > 2000) {
      setError('Keep the outcome under 2,000 characters.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      let workspaceId = activeWorkspace?.id ?? null;
      if (!workspaceId) {
        const workspace = await createWorkspace({ name: 'My Cherry' });
        if (!workspace.ok) {
          setError(workspace.error.message);
          return;
        }
        workspaceId = workspace.value.id;
        setActiveWorkspace(workspaceId);
      }

      const result = await createMission({
        workspaceId,
        outcome: trimmedOutcome,
        ...(templateId ? { templateId } : {}),
        repositoryRoot: repositoryRoot.trim() || null,
        constraints: constraints.split('\n').map((line) => line.trim()).filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setActiveMission(result.value.mission.id);
      await refresh();
      if (searchParams.get('outcome')) setSearchParams({}, { replace: true });
      navigate(`/studio/control/${result.value.mission.id}`);
    } catch {
      setError('Cherry could not save that mission. Your outcome is still here—try again.');
    } finally {
      setBusy(false);
    }
  }

  const runnerLine = runnerChecking
    ? 'Checking for a paired runner.'
    : runner === null
      ? 'Open these settings to check this device for a paired runner.'
      : runner.reachable && runner.paired
        ? 'Runner paired. Live start appears only when an eligible host, plan, and policy are ready.'
        : runner.reachable
          ? 'Runner found but not paired. Pair it in Connections before live start can appear.'
          : 'No runner detected. Planning and the recorded replay still work here.';

  return (
    <main className="chronicle-control" data-testid="mission-control">
      <header className="chronicle-control__masthead">
        <div>
          <p className="chronicle-control__kicker">Mission Control · Outcome desk</p>
          <h1 className="display-sm">What should Cherry take care of?</h1>
          <p className="chronicle-control__intro">
            Describe the result. Cherry turns it into a durable plan, with the team, checks, and decisions recorded before anything runs.
          </p>
        </div>
        <picture aria-hidden="true">
          <source media="(max-width: 700px)" srcSet="/media/cherry-chronicle/artifacts/seed-outcome-mobile.svg" />
          <img className="chronicle-control__seed" src="/media/cherry-chronicle/artifacts/seed-outcome-desktop.svg" alt="" />
        </picture>
      </header>

      <form onSubmit={handlePlan} className="chronicle-composer" data-testid="outcome-composer">
        <label className="field">
          <span>Outcome</span>
          <textarea
            className="textarea"
            name="outcome"
            rows={4}
            required
            minLength={8}
            maxLength={2000}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="Research this market and produce an evidence-backed launch brief."
            data-testid="outcome-input"
          />
        </label>

        <details
          className="chronicle-settings"
          data-testid="execution-settings"
          onToggle={(event) => {
            if (event.currentTarget.open) void checkRunner();
          }}
        >
          <summary>Execution settings</summary>
          <div className="chronicle-settings__body">
            <label className="field">
              <span>Plan template</span>
              <select className="select" value={templateId} onChange={(event) => setTemplateId(event.target.value)} data-testid="template-select">
                <option value="">Choose from the outcome</option>
                {MISSION_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Repository folder (optional, under a runner root)</span>
              <input className="input" value={repositoryRoot} onChange={(event) => setRepositoryRoot(event.target.value)} placeholder="D:\project\example" data-testid="repository-input" />
            </label>
            <label className="field">
              <span>Constraints, one per line (optional)</span>
              <textarea className="textarea" rows={2} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Nothing public without approval." />
            </label>
            <p className="chronicle-settings__runner" data-testid="runner-line">{runnerLine}</p>
          </div>
        </details>

        <div className="chronicle-composer__footer">
          <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {activeWorkspace ? `Planning in ${activeWorkspace.name}` : 'Your first plan creates My Cherry here.'}
          </span>
          <button type="submit" className="btn btn-primary" disabled={!ready || busy} aria-busy={busy} data-testid="plan-mission">
            {!ready ? 'Opening Cherry' : busy ? 'Planning' : 'Plan the mission'}
          </button>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </form>

      <aside className="chronicle-replay" aria-label="Recorded mission replay">
        <span>
          <Link to="/showcase#recorded-codex-mission">Replay the verified Codex mission</Link>
          {' '}— a recorded, read-only walkthrough that needs no runner.
        </span>
      </aside>

      {cards.length > 0 ? (
        <section className="chronicle-ledger" aria-labelledby="mission-ledger-heading">
          <div className="chronicle-ledger__toolbar">
            <h2 id="mission-ledger-heading" className="subhead chronicle-ledger__title">Mission ledger</h2>
            <div className="row">
              <label className="row" style={{ gap: 'var(--sp-2)' }}>
                <input type="checkbox" checked={liveSync} onChange={(event) => setLiveSync(event.target.checked)} data-testid="live-sync" />
                <span className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>Sync every 5 seconds</span>
              </label>
              <button type="button" className="btn btn-sm" onClick={() => void load()}>Refresh</button>
            </div>
          </div>

          <div className="chronicle-ledger__columns" data-testid="mission-columns">
            {COLUMNS.map((column) => {
              const items = cards.filter((card) => card.column === column.id);
              return (
                <section key={column.id} className="chronicle-ledger__column stack" aria-labelledby={`column-${column.id}`} data-testid={`column-${column.id}`}>
                  <h3 id={`column-${column.id}`} className="subhead">{column.title} <span className="label tnum">{items.length}</span></h3>
                  {items.length === 0
                    ? <p className="chronicle-ledger__empty">{column.empty}</p>
                    : items.map((card) => <MissionCardView key={card.planId} card={card} />)}
                </section>
              );
            })}
          </div>

          <p className="label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0 }}>
            {missionStatusLabel('running')} means a worker holds a runner lease; {missionStatusLabel('succeeded')} means every required check passed.
          </p>
        </section>
      ) : null}
    </main>
  );
}
