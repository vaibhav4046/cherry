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
import { validateSchedule, type Routine, type ScheduleSpec } from '../../cherry/workforce/workforce-model.ts';
import type { Result } from '../../cherry/core/result.ts';

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

  const load = useCallback(async (resetEditor: boolean) => {
    if (!activeWorkspace || !routineId) return;
    const loaded = await getRoutine(activeWorkspace.id, routineId);
    setRoutine(loaded);
    if (loaded && resetEditor) setEditor(editorFromRoutine(loaded));
  }, [activeWorkspace, routineId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  if (!activeWorkspace) {
    return (
      <div className="stack">
        <h1 className="display-sm title-3d">Routine</h1>
        <p className="subhead">Create a workspace in the Command Center first — routines live inside it.</p>
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
    if (!result.ok) setError(result.error.message);
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
      'Schedule saved as a new revision. Any prior approval is cleared — approve below to enable.',
      true,
    );
  }

  async function handleRunNow() {
    const result = await run(() => requestRunNow(activeWorkspace!.id, routine!.id));
    if (result.ok) setNotice(result.value.note);
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
          {describeSchedule(routine.schedule)} · host {routine.executionHostId}. Runs on schedule while an
          approved local or cloud execution host is available.
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
          Saving clears any existing approval: the routine goes back to disabled until you approve the new revision.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={busy || problems.length > 0}
            onClick={() => void handleSaveSchedule()}
            data-testid="routine-save-schedule"
          >
            Save schedule
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => approveRoutine(activeWorkspace!.id, routine!.id, routine!.revision), 'Routine approved and enabled.')}
            data-testid="routine-approve"
          >
            Approve &amp; enable r{routine.revision}
          </button>
          {routine.enabled ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => pauseRoutine(activeWorkspace!.id, routine!.id), 'Routine paused. Its approval is kept.')}>
              Pause
            </button>
          ) : (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => resumeRoutine(activeWorkspace!.id, routine!.id), 'Routine resumed.')}>
              Resume
            </button>
          )}
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handleRunNow()}>
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
        <p className="label" style={{ margin: 0 }}>Next run: {fmt(routine.nextRunAt)} · Last run: {fmt(routine.lastRunAt)}</p>
      </section>
    </div>
  );
}
