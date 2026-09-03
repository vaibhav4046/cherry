import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { createWorkspace, deleteWorkspace } from '../../cherry/mission/mission-service.ts';
import { runnerStatus, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';
import { createMission, listMissionCards, syncMission, type MissionCard } from '../../cherry/workforce/mission-control-service.ts';
import { MISSION_TEMPLATES } from '../../cherry/workforce/mission-templates.ts';
import { MissionCardView, missionStatusLabel } from './MissionCardView.tsx';
import '../../components/studio/mission-control/MissionControl.css';

const SYNC_INTERVAL_MS = 5000;

type Column = MissionCard['column'];
const COLUMNS: Array<{ id: Column; title: string; empty: string }> = [
  { id: 'planned', title: 'Planned', empty: 'No plan is waiting to start.' },
  { id: 'working', title: 'Working', empty: 'Nothing is running.' },
  { id: 'needs_you', title: 'Needs you', empty: 'Nothing is waiting on you.' },
  { id: 'completed', title: 'Completed', empty: 'No finished missions yet.' },
];

/** Mission Control: one outcome becomes a durable, reviewable plan. */
export default function MissionControl() {
  const { ready, activeWorkspace, workspaces, webmcp, refresh, setActiveWorkspace, setActiveMission } = useAppState();
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
    if (runnerChecking) return;
    setRunnerChecking(true);
    try {
      setRunner(await runnerStatus());
    } catch {
      setRunner({ reachable: false, paired: false });
    } finally {
      setRunnerChecking(false);
    }
  }

  // The space a new plan goes to: the active space when it is the person's own,
  // otherwise an existing own space (My Cherry first), otherwise none yet.
  const planningWorkspace =
    activeWorkspace && activeWorkspace.isExample !== true
      ? activeWorkspace
      : workspaces.find((workspace) => workspace.isExample !== true && workspace.name === 'My Cherry')
        ?? workspaces.find((workspace) => workspace.isExample !== true)
        ?? null;
  const planningLine = planningWorkspace
    ? activeWorkspace?.isExample === true
      ? `Planning in ${planningWorkspace.name}. Sample spaces are never used for your own plans.`
      : `Planning in ${planningWorkspace.name}`
    : activeWorkspace?.isExample === true
      ? 'Your first plan creates My Cherry. Sample spaces are never used for your own plans.'
      : 'Your first plan creates My Cherry here.';

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
    let createdWorkspaceId: string | null = null;

    async function failWithCompensation(message: string) {
      if (!createdWorkspaceId) {
        setError(message);
        return;
      }
      try {
        const cleanup = await deleteWorkspace(createdWorkspaceId);
        if (!cleanup.ok) {
          setError(`${message} Cherry could not remove the unfinished My Cherry space: ${cleanup.error.message}. Your outcome is still here; try again.`);
          return;
        }
        setError(`${message} The unfinished My Cherry space was removed. Your outcome is still here; try again.`);
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : 'cleanup failed unexpectedly';
        setError(`${message} Cherry could not remove the unfinished My Cherry space: ${detail}. Your outcome is still here; try again.`);
      }
    }

    try {
      // A plan is the person's own work, so it never lands in a sample space:
      // Reset demo removes sample spaces, and it must never remove a real plan.
      let workspaceId = planningWorkspace?.id ?? null;
      const switchWorkspace = planningWorkspace !== null && planningWorkspace.id !== activeWorkspace?.id;
      let missionResult: Awaited<ReturnType<typeof createMission>>;

      try {
        if (!workspaceId) {
          const workspace = await createWorkspace({ name: 'My Cherry' });
          if (!workspace.ok) {
            setError(workspace.error.message);
            return;
          }
          workspaceId = workspace.value.id;
          createdWorkspaceId = workspaceId;
        }

        missionResult = await createMission({
          workspaceId,
          outcome: trimmedOutcome,
          ...(templateId ? { templateId } : {}),
          repositoryRoot: repositoryRoot.trim() || null,
          constraints: constraints.split('\n').map((line) => line.trim()).filter(Boolean),
        });
      } catch {
        await failWithCompensation('Cherry could not save that mission.');
        return;
      }

      if (!missionResult.ok) {
        await failWithCompensation(missionResult.error.message);
        return;
      }
      const savedMissionId = missionResult.value.mission.id;

      try {
        if (createdWorkspaceId || switchWorkspace) setActiveWorkspace(workspaceId);
        setActiveMission(savedMissionId);
        await refresh();
        if (searchParams.get('outcome')) setSearchParams({}, { replace: true });
        await navigate(`/studio/control/${savedMissionId}`);
      } catch {
        setError('The mission was saved, but Cherry could not refresh Mission Control or open it. Your outcome is still here; reload to continue.');
      }
    } finally {
      setBusy(false);
    }
  }

  const runnerLine = runnerChecking
    ? 'Looking for a paired computer.'
    : runner === null
      ? 'Open these settings to look for a paired computer.'
      : runner.reachable && runner.paired
        ? 'Your computer is paired. A Start button appears on a plan once an agent is signed in there and you have approved the plan.'
        : runner.reachable
          ? 'A computer was found but is not paired yet. Pair it under Connect before work can start.'
          : 'No paired computer on this device. Planning and the recorded run work here without one.';

  return (
    <section className="chronicle-control" data-testid="mission-control" aria-labelledby="mission-control-heading">
      <header className="chronicle-control__masthead">
        <div>
          <p className="chronicle-control__kicker">Mission Control</p>
          <h1 id="mission-control-heading" className="display-sm">What should Cherry take care of?</h1>
          <p className="chronicle-control__intro">
            Describe the result you want. Cherry writes a plan you can read first: who does what, which checks must pass, and where it stops for you.
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
            {planningLine}
          </span>
          <button type="submit" className="btn btn-primary" disabled={!ready || busy} aria-busy={busy} data-testid="plan-mission">
            {!ready ? 'Opening Cherry' : busy ? 'Planning' : 'Plan the mission'}
          </button>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
      </form>

      {webmcp.supported ? (
        <aside className="chronicle-replay" aria-label="Site tools for your agent" data-testid="site-tools-note">
          <span>
            <strong>Your agent can drive this page.</strong> This browser exposes site tools, so the assistant you are
            talking to can write the outcome, plan the mission and ask to start it. It cannot approve anything: that
            stays with you. Every call it makes appears in <Link to="/studio/agent">Agent</Link>.
          </span>
        </aside>
      ) : null}

      <aside className="chronicle-replay" aria-label="Recorded mission replay">
        <span>
          <Link to="/showcase#recorded-mission">Replay the verified Codex mission</Link>
          {' '}(a recorded, read-only walkthrough that needs no runner).
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
    </section>
  );
}
