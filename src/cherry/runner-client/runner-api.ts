import { ok, type Result } from '../core/result.ts';
import { fail } from '../core/result.ts';

export interface RunnerStatus {
  paired: boolean;
  reachable: boolean;
  version?: string;
  queueDepth?: number;
  adapters?: string[];
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
    const body = (await response.json()) as { version?: string; queueDepth?: number; adapters?: string[]; paired?: boolean };
    return {
      paired: body.paired === true,
      reachable: true,
      ...(body.version ? { version: body.version } : {}),
      ...(typeof body.queueDepth === 'number' ? { queueDepth: body.queueDepth } : {}),
      ...(body.adapters ? { adapters: body.adapters } : {}),
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
    return fail('temporary', 'No runner is listening on 127.0.0.1:47821. Start it with: node runner/dist/server.js');
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
  adapter: 'cherry-verify' | 'cherry-export';
  input: Record<string, unknown>;
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
