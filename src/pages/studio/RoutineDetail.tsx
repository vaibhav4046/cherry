import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import {
  approveRoutine,
  describeSchedule,
  getRoutine,
  pauseRoutine,
  requestRunNow,
  resumeRoutine,
  setRoutineSchedule,
} from '../../cherry/workforce/routines-service.ts';
import { listRuns } from '../../cherry/mission/mission-service.ts';
import type { RunRecord } from '../../cherry/mission/mission-model.ts';
import { validateSchedule, type Routine, type ScheduleSpec } from '../../cherry/workforce/workforce-model.ts';
import type { Result } from '../../cherry/core/result.ts';
import { getSkillGraph } from '../../cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../../cherry/skillgraph/skillgraph-model.ts';
import { plainRoutineMessage } from './routine-copy.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO timestamp → value for <input type="datetime-local"> in the local zone. */
function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local value → ISO timestamp; invalid input passes through so validation reports it. */
function localInputToIso(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

interface EditorState {
  kind: ScheduleSpec['kind'];
  onceAt: string;
  everyMinutes: string;
  startAt: string;
  localTime: string;
  timeZone: string;
  weekdays: number[];
  missedRunPolicy: Routine['missedRunPolicy'];
}

function editorFromRoutine(routine: Routine): EditorState {
  const spec = routine.schedule;
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    kind: spec.kind,
    onceAt: spec.kind === 'once' ? isoToLocalInput(spec.runAt) : '',
    everyMinutes: spec.kind === 'interval' ? String(spec.everyMinutes) : '60',
    startAt: spec.kind === 'interval' ? isoToLocalInput(spec.startAt) : isoToLocalInput(new Date().toISOString()),
    localTime: spec.kind === 'daily' || spec.kind === 'weekly' ? spec.localTime : '09:00',
    timeZone: spec.kind === 'daily' || spec.kind === 'weekly' ? spec.timeZone : localZone,
    weekdays: spec.kind === 'weekly' ? spec.weekdays : [1],
    missedRunPolicy: routine.missedRunPolicy,
  };
}

function specFromEditor(editor: EditorState): ScheduleSpec {
  switch (editor.kind) {
    case 'manual':
      return { kind: 'manual' };
    case 'once':
      return { kind: 'once', runAt: localInputToIso(editor.onceAt) };
    case 'interval':
      return { kind: 'interval', everyMinutes: Number(editor.everyMinutes), startAt: localInputToIso(editor.startAt) };
    case 'daily':
      return { kind: 'daily', localTime: editor.localTime, timeZone: editor.timeZone };
    case 'weekly':
      return { kind: 'weekly', weekdays: [...editor.weekdays].sort((a, b) => a - b), localTime: editor.localTime, timeZone: editor.timeZone };
  }
}

export default function RoutineDetail() {
  const { routineId } = useParams<{ routineId: string }>();
  const { activeWorkspace } = useAppState();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [skillGraph, setSkillGraph] = useState<SkillGraph | null>(null);

  const load = useCallback(async (resetEditor: boolean) => {
    if (!activeWorkspace || !routineId) return;
    const loaded = await getRoutine(activeWorkspace.id, routineId);
    setRoutine(loaded);
    setRuns((await listRuns(activeWorkspace.id)).filter((run) => run.routineId === routineId));
    setSkillGraph(loaded ? ((await getSkillGraph(loaded.skillGraphId)) ?? null) : null);
    if (loaded && resetEditor) setEditor(editorFromRoutine(loaded));
  }, [activeWorkspace, routineId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  if (!activeWorkspace) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Routine</h1>
        <p className="subhead">Create your space in the Command Center before adding a routine.</p>
        <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Open Command Center</Link>
      </div>
    );
  }

  if (!routine || !editor) {
    return (
      <div className="empty-state">
        <p className="subhead">Routine not found.</p>
        <Link to="/studio/routines" className="btn">Back to Routines</Link>
      </div>
    );
  }

  const spec = specFromEditor(editor);
  const problems = validateSchedule(spec);

  async function run<T>(work: () => Promise<Result<T>>, successNote?: string, resetEditor = false) {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.ok) setError(plainRoutineMessage(result.error.message));
    else if (successNote) setNotice(successNote);
    await load(resetEditor);
    return result;
  }

  function patchEditor(patch: Partial<EditorState>) {
    setEditor((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleWeekday(day: number) {
    setEditor((current) => {
      if (!current) return current;
      const weekdays = current.weekdays.includes(day)
        ? current.weekdays.filter((entry) => entry !== day)
        : [...current.weekdays, day];
      return { ...current, weekdays };
    });
  }

  async function handleSaveSchedule() {
    await run(
      () => setRoutineSchedule(activeWorkspace!.id, routine!.id, spec, editor!.missedRunPolicy),
      spec.kind === 'manual'
        ? 'Manual routine saved as a new version. Your prior approval was cleared. Approve below to use Run now.'
        : 'Timed schedule saved as a draft. Timed runner registration is not connected yet, so it cannot be enabled.',
      true,
    );
  }

  async function handleRunNow() {
    const result = await run(() => requestRunNow(activeWorkspace!.id, routine!.id));
    if (result.ok) setNotice(result.value.note);
  }

  async function handleRerun() {
    await handleRunNow();
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <header className="stack" style={{ gap: 'var(--sp-2)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 className="display-sm title-3d">{routine.name}</h1>
          <span className={routine.enabled ? 'sticker sticker-pass' : 'sticker sticker-wait'} data-testid="routine-enabled-sticker">
            {routine.enabled ? 'enabled' : 'disabled'} · r{routine.revision}
          </span>
        </div>
        <p className="subhead" style={{ maxWidth: 680 }}>
          {describeSchedule(routine.schedule)} · {routine.executionHostId === 'local-runner' ? 'local runner' : 'paired runner'}.{' '}
          {routine.schedule.kind === 'manual'
            ? 'Nothing starts until you choose Run now.'
            : 'This is a saved preview. Timed runner registration is not connected yet.'}
        </p>
        <Link to="/studio/routines" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Back to Routines</Link>
      </header>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {notice ? <p className="sticker sticker-pass" role="status">{notice}</p> : null}

      <section className="card stack" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="subhead" style={{ fontSize: 20 }}>Schedule</h2>
        <div className="row">
          <label className="field">
            <span>Kind</span>
            <select
              className="select"
              value={editor.kind}
              onChange={(event) => patchEditor({ kind: event.target.value as ScheduleSpec['kind'] })}
            >
              <option value="manual">Manual</option>
              <option value="once">Once</option>
              <option value="interval">Interval</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="field">
            <span>Missed-run policy</span>
            <select
              className="select"
              value={editor.missedRunPolicy}
              onChange={(event) => patchEditor({ missedRunPolicy: event.target.value as Routine['missedRunPolicy'] })}
            >
              <option value="skip">Skip missed runs</option>
              <option value="run_once_on_reconnect">Run once on reconnect</option>
            </select>
          </label>
        </div>

        {editor.kind === 'once' ? (
          <label className="field">
            <span>Run at</span>
            <input
              className="input"
              type="datetime-local"
              value={editor.onceAt}
              onChange={(event) => patchEditor({ onceAt: event.target.value })}
            />
          </label>
        ) : null}

        {editor.kind === 'interval' ? (
          <div className="row">
            <label className="field">
              <span>Every (minutes, min 5)</span>
              <input
                className="input"
                type="number"
                min={5}
                value={editor.everyMinutes}
                onChange={(event) => patchEditor({ everyMinutes: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Starting from</span>
              <input
                className="input"
                type="datetime-local"
                value={editor.startAt}
                onChange={(event) => patchEditor({ startAt: event.target.value })}
              />
            </label>
          </div>
        ) : null}

        {editor.kind === 'daily' || editor.kind === 'weekly' ? (
          <div className="row">
            <label className="field">
              <span>Local time</span>
              <input
                className="input"
                type="time"
                value={editor.localTime}
                onChange={(event) => patchEditor({ localTime: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Time zone (IANA)</span>
              <input
                className="input"
                value={editor.timeZone}
                onChange={(event) => patchEditor({ timeZone: event.target.value })}
                placeholder="Europe/London"
              />
            </label>
          </div>
        ) : null}

        {editor.kind === 'weekly' ? (
          <div className="row" role="group" aria-label="Weekdays">
            {WEEKDAYS.map((name, day) => (
              <label key={name} className="row" style={{ gap: 4, fontSize: 14 }}>
                <input type="checkbox" checked={editor.weekdays.includes(day)} onChange={() => toggleWeekday(day)} />
                {name}
              </label>
            ))}
          </div>
        ) : null}

        {problems.length > 0 ? (
          <div className="field-error" role="alert">
            {problems.map((problem) => (
              <p key={problem} style={{ margin: 0 }}>{problem}</p>
            ))}
          </div>
        ) : null}

        <p className="label" style={{ margin: 0 }}>
          {spec.kind === 'manual'
            ? 'Saving clears the current approval. Approve the saved manual version before using Run now.'
            : 'Timed schedules stay disabled until Cherry can register the exact approved version with your runner.'}
        </p>
        <div className="row">
          <button
            type="button"
            className={spec.kind === 'manual' ? 'btn' : 'btn btn-primary'}
            disabled={busy || problems.length > 0}
            onClick={() => void handleSaveSchedule()}
            data-testid="routine-save-schedule"
          >
            Save schedule
          </button>
          {routine.schedule.kind === 'manual' && spec.kind === 'manual' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void run(() => approveRoutine(activeWorkspace!.id, routine!.id, routine!.revision), 'Manual routine approved. Run now is available.')}
              data-testid="routine-approve"
            >
              Approve manual r{routine.revision}
            </button>
          ) : null}
          {routine.enabled && routine.schedule.kind === 'manual' ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => pauseRoutine(activeWorkspace!.id, routine!.id), 'Routine paused. Its approval is kept.')}>
              Pause
            </button>
          ) : routine.schedule.kind === 'manual' && routine.approvalId ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => resumeRoutine(activeWorkspace!.id, routine!.id), 'Routine resumed.')}>
              Resume
            </button>
          ) : null}
          <button type="button" className="btn btn-sm" disabled={busy || !routine.enabled || routine.schedule.kind !== 'manual'} onClick={() => void handleRunNow()}>
            Run now
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="status-heading">
        <h2 id="status-heading" className="subhead" style={{ fontSize: 20 }}>Approval &amp; runs</h2>
        <div className="row">
          <span className={routine.approvalId ? 'sticker sticker-pass' : 'sticker sticker-wait'}>
            {routine.approvalId ? `approved r${routine.revision}` : 'not approved'}
          </span>
          {routine.approvedActionHash ? (
            <span className="sticker mono">hash {routine.approvedActionHash.slice(0, 16)}…</span>
          ) : null}
          <span className="sticker">policy: {routine.missedRunPolicy.replace(/_/g, ' ')}</span>
        </div>
        <p className="label" style={{ margin: 0 }}>{routine.schedule.kind === 'manual' ? 'Next run' : 'Schedule preview'}: {fmt(routine.nextRunAt)} · Last run: {fmt(routine.lastRunAt)}</p>
        <div className="routine-graph-binding" aria-label="Approved skill version">
          <strong>Approved skill</strong>
          {skillGraph ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{skillGraph.name}</span>
              <span className="sticker mono">v{skillGraph.version} · r{skillGraph.revision}</span>
              {skillGraph.versionHash ? <span className="sticker mono" title={skillGraph.versionHash}>hash {skillGraph.versionHash.slice(0, 16)}…</span> : null}
              <Link className="btn btn-sm" to={`/studio/skills/${skillGraph.id}`}>Open skill</Link>
            </div>
          ) : <p className="label" style={{ margin: 0 }}>The approved skill is unavailable, so Cherry cannot confirm this routine.</p>}
        </div>
      </section>
      <section className="card stack" aria-labelledby="history-heading">
        <h2 id="history-heading" className="subhead" style={{ fontSize: 20 }}>Run history ({runs.length})</h2>
        <p className="label" style={{ margin: 0 }}>Run records and proof stay in this browser. Cherry never runs them in the cloud.</p>
        <Link className="btn btn-sm" to="/studio/settings/connections" style={{ alignSelf: 'flex-start' }}>Check local runner</Link>
        {runs.length === 0 ? <p className="label">No runs yet. Check the runner connection, then use Run now.</p> : <div className="stack">{runs.map((runRecord) => <article key={runRecord.id} className="routine-run-row" data-testid="routine-run-history"><div className="row" style={{ justifyContent: 'space-between' }}><strong>{runRecord.status}</strong><span className="mono">{fmt(runRecord.createdAt)}</span></div><div className="label">{runRecord.summary}</div>{runRecord.provider ? <div className="mono">Run by: {runRecord.provider.kind} · {runRecord.provider.status}</div> : null}{runRecord.outputSummary ? <pre className="routine-output">{runRecord.outputSummary}</pre> : null}{runRecord.error ? <p className="field-error">{plainRoutineMessage(runRecord.error)} Correct the issue, then use Run again.</p> : null}{runRecord.receiptId ? <div className="mono">proof: {runRecord.receiptId}</div> : null}<button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handleRerun()}>Run again</button></article>)}</div>}
      </section>
    </div>
  );
}
