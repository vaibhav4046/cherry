import { ok, type Result } from '../core/result.ts';
import { fail } from '../core/result.ts';

export interface RunnerStatus {
  paired: boolean;
  reachable: boolean;
  version?: string;
  queueDepth?: number;
  adapters?: string[];
  scraplingReady?: boolean;
}

const RUNNER_ORIGIN = 'http://127.0.0.1:47821';
const PAIR_STORAGE_KEY = 'cherry.runner.pairToken';

/**
 * Client for the optional localhost runner. When the runner is off, every call
 * fails cleanly and the UI shows "waiting for runner" — never a fake running
 * state. The pairing token is entered by the user from the runner's console.
 */
export function getStoredPairToken(): string | null {
  try {
    return sessionStorage.getItem(PAIR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storePairToken(token: string): void {
  try {
    sessionStorage.setItem(PAIR_STORAGE_KEY, token);
  } catch {
    // Storage unavailable: pairing lasts only for in-memory use.
  }
}

export function clearPairToken(): void {
  try {
    sessionStorage.removeItem(PAIR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function runnerFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getStoredPairToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('x-cherry-pair', token);
  headers.set('content-type', 'application/json');
  return fetch(`${RUNNER_ORIGIN}${path}`, { ...init, headers, signal: AbortSignal.timeout(4000) });
}

export async function runnerStatus(): Promise<RunnerStatus> {
  try {
    const response = await runnerFetch('/status');
    if (!response.ok) return { paired: false, reachable: true };
    const body = (await response.json()) as { version?: string; queueDepth?: number; adapters?: string[]; paired?: boolean; scraplingReady?: boolean };
    return {
      paired: body.paired === true,
      reachable: true,
      ...(body.version ? { version: body.version } : {}),
      ...(typeof body.queueDepth === 'number' ? { queueDepth: body.queueDepth } : {}),
      ...(body.adapters ? { adapters: body.adapters } : {}),
      scraplingReady: body.scraplingReady === true,
    };
  } catch {
    return { paired: false, reachable: false };
  }
}

export async function pairRunner(token: string): Promise<Result<{ paired: true }>> {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(token)) {
    return fail('validation', 'That does not look like a runner pairing token');
  }
  storePairToken(token.trim());
  const status = await runnerStatus();
  if (!status.reachable) {
    clearPairToken();
    return fail('temporary', 'No runner is listening on 127.0.0.1:47821. Start it with: node runner/server.mjs');
  }
  if (!status.paired) {
    clearPairToken();
    return fail('validation', 'The runner rejected that pairing token');
  }
  return ok({ paired: true });
}

export interface RunnerJobRequest {
  workspaceId: string;
  missionId: string;
  adapter: 'cherry-verify' | 'cherry-export' | 'scrapling-fetch';
  input: Record<string, unknown>;
  idempotencyKey?: string;
  workingDirectory?: string;
}

export async function submitRunnerJob(request: RunnerJobRequest): Promise<Result<{ jobId: string }>> {
  try {
    const response = await runnerFetch('/jobs', { method: 'POST', body: JSON.stringify(request) });
    if (response.status === 401) return fail('approval_required', 'Runner pairing token missing or invalid');
    if (!response.ok) return fail('temporary', `Runner returned ${response.status}`);
    const body = (await response.json()) as { jobId?: string };
    if (!body.jobId) return fail('internal', 'Runner did not return a job id');
    return ok({ jobId: body.jobId });
  } catch {
    return fail('temporary', 'Runner is not reachable; the job stays queued locally');
  }
}

export interface RunnerJobStatus {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  result?: { exitCode?: number; stdout?: string; stderr?: string };
  startedAt?: string;
  finishedAt?: string;
}

export async function pollRunnerJob(jobId: string): Promise<Result<RunnerJobStatus>> {
  try {
    const response = await runnerFetch(`/jobs/${encodeURIComponent(jobId)}`);
    if (response.status === 401) return fail('approval_required', 'Runner pairing token missing or invalid');
    if (response.status === 404) return fail('not_found', 'Runner job not found');
    if (!response.ok) return fail('temporary', `Runner returned ${response.status}`);
    const body = (await response.json()) as { job?: RunnerJobStatus };
    return body.job ? ok(body.job) : fail('internal', 'Runner returned no job status');
  } catch { return fail('temporary', 'Runner is not reachable'); }
}

export async function cancelRunnerJob(jobId: string): Promise<Result<RunnerJobStatus>> {
  try {
    const response = await runnerFetch(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', body: '{}' });
    if (response.status === 401) return fail('approval_required', 'Runner pairing token missing or invalid');
    if (!response.ok) return fail('temporary', `Runner returned ${response.status}`);
    const body = (await response.json()) as { job?: RunnerJobStatus };
    return body.job ? ok(body.job) : fail('internal', 'Runner returned no job');
  } catch { return fail('temporary', 'Runner is not reachable'); }
}
