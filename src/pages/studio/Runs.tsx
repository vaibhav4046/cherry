import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState.tsx';
import { listRuns } from '../../cherry/mission/mission-service.ts';
import { settleRun, attachRunnerJob } from '../../cherry/workforce/routines-service.ts';
import type { RunRecord } from '../../cherry/mission/mission-model.ts';
import { runnerStatus, submitRunnerJob, pollRunnerJob, cancelRunnerJob, type RunnerStatus } from '../../cherry/runner-client/runner-api.ts';

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
      idempotencyKey: run.idempotencyKey,
      input: run.adapter === 'cherry-verify' ? { bundleDir: '.' } : { dir: '.' },
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const attached = await attachRunnerJob(run.id, result.value.jobId, run.runnerCapabilityToken ?? '');
    if (!attached.ok) { setError(attached.error.message); return; }
    const started = await settleRun(run.id, 'running', { runnerCapabilityToken: run.runnerCapabilityToken });
    if (!started.ok) { setError(started.error.message); return; }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const polled = await pollRunnerJob(result.value.jobId);
      if (!polled.ok || polled.value.status === 'queued' || polled.value.status === 'running') {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (polled.value.status === 'failed') await settleRun(run.id, 'failed', { error: polled.value.result?.stderr, outputSummary: polled.value.result?.stdout, runnerCapabilityToken: run.runnerCapabilityToken });
      if (polled.value.status === 'cancelled') await settleRun(run.id, 'cancelled', { outputSummary: polled.value.result?.stdout, runnerCapabilityToken: run.runnerCapabilityToken });
      if (polled.value.status === 'succeeded') setError('Runner completed; attach a verified receipt before this run can be marked successful.');
      break;
    }
    await load();
  }

  async function handleCancel(run: RunRecord) {
    if (run.runnerJobId) await cancelRunnerJob(run.runnerJobId);
    await settleRun(run.id, 'cancelled', { runnerCapabilityToken: run.runnerCapabilityToken });
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
                    {run.detail ? <div style={{ fontSize: 13, color: 'var(--color-ink-soft)' }}>{run.detail}</div> : null}
                    {run.runnerJobId ? <div className="label">runner job: {run.runnerJobId}</div> : null}
                    {run.idempotencyKey ? <div className="label">idempotency: {run.idempotencyKey}</div> : null}
                    {run.outputSummary ? <div className="label">output: {run.outputSummary}</div> : null}
                    {run.error ? <div className="label">error: {run.error}</div> : null}
                    {run.receiptId ? <div className="label">receipt: {run.receiptId}</div> : null}
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
