import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState.tsx';
import { listRuns, updateRun } from '../../cherry/mission/mission-service.ts';
import type { RunRecord } from '../../cherry/mission/mission-model.ts';
import { runnerStatus, submitRunnerJob, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';

export default function Runs() {
  const { activeWorkspace } = useAppState();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runner, setRunner] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setRuns(await listRuns(activeWorkspace.id));
    setRunner(await runnerStatus());
  }, [activeWorkspace]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeWorkspace) {
    return <div className="empty-state"><p className="subhead">Create a workspace first.</p></div>;
  }

  async function handleDispatch(run: RunRecord) {
    setError(null);
    if (run.adapter !== 'cherry-verify' && run.adapter !== 'cherry-export') {
      setError('Only deterministic adapters can be dispatched from here.');
      return;
    }
    const result = await submitRunnerJob({
      workspaceId: run.workspaceId,
      missionId: run.missionId,
      adapter: run.adapter,
      input: {},
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await updateRun(run.id, { status: 'running', startedAt: new Date().toISOString(), detail: `Runner job ${result.value.jobId}` });
    await load();
  }

  async function handleCancel(run: RunRecord) {
    await updateRun(run.id, { status: 'cancelled', finishedAt: new Date().toISOString() }, 'human');
    await load();
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Runs & Runner</h1>
      <div className="row">
        {runner === null ? (
          <span className="sticker">Checking runner…</span>
        ) : runner.reachable && runner.paired ? (
          <span className="sticker sticker-pass">Runner paired · v{runner.version ?? '?'} · queue {runner.queueDepth ?? 0}</span>
        ) : runner.reachable ? (
          <span className="sticker sticker-wait">Runner reachable, not paired — pair it in Connections</span>
        ) : (
          <span className="sticker sticker-wait">Runner offline — queued jobs wait, they never fake progress</span>
        )}
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {runs.length === 0 ? (
        <p className="card">
          No runs yet. Runs record execution attempts — manual, agent-driven, or runner jobs. Provider
          activity and deterministic verification always appear as separate statuses.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Adapter · mode</th>
                <th scope="col">Status</th>
                <th scope="col">Timing</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <strong>{run.summary}</strong>
                    {run.detail ? <div style={{ fontSize: 12, color: 'var(--color-ink-soft)' }}>{run.detail}</div> : null}
                    {run.provider ? (
                      <div className="label">provider: {run.provider.kind} ({run.provider.status}) — verified separately</div>
                    ) : null}
                  </td>
                  <td>{run.adapter} · {run.mode}</td>
                  <td>
                    <span className={run.status === 'succeeded' ? 'sticker sticker-pass' : run.status === 'failed' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>
                      {run.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="mono">
                    {run.startedAt ? run.startedAt.slice(11, 19) : '—'} → {run.finishedAt ? run.finishedAt.slice(11, 19) : '—'}
                  </td>
                  <td>
                    <div className="row">
                      {run.status === 'waiting_for_runner' && runner?.paired ? (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => void handleDispatch(run)}>Dispatch</button>
                      ) : null}
                      {run.status === 'queued' || run.status === 'waiting_for_runner' || run.status === 'running' ? (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleCancel(run)}>Cancel</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
