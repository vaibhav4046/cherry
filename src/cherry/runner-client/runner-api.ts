import { ok, type Result } from '../core/result.ts';
import { fail } from '../core/result.ts';

export interface RunnerStatus {
  paired: boolean;
  reachable: boolean;
  version?: string;
  queueDepth?: number;
  adapters?: string[];
  v2Adapters?: string[];
  scraplingReady?: boolean;
  scraplingConfigured?: boolean;
  scraplingStatus?: 'checking' | 'ready' | 'setup_required' | 'check_failed' | 'not_configured';
  scraplingReason?: string;
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

const DEFAULT_TIMEOUT_MS = 4000;
/** Probing every agent host spawns CLIs on the runner; the first uncached answer can take longer than a status check. */
const HOST_PROBE_TIMEOUT_MS = 20_000;

async function runnerFetch(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const token = getStoredPairToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('x-cherry-pair', token);
  headers.set('content-type', 'application/json');
  return fetch(`${RUNNER_ORIGIN}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}

export async function runnerStatus(): Promise<RunnerStatus> {
  try {
    const response = await runnerFetch('/status');
    if (!response.ok) return { paired: false, reachable: true };
    const body = (await response.json()) as { version?: string; queueDepth?: number; adapters?: string[]; paired?: boolean; scraplingReady?: boolean; scraplingConfigured?: boolean; scraplingStatus?: RunnerStatus['scraplingStatus']; scraplingReason?: string; v2?: { adapters?: string[] } };
    return {
      paired: body.paired === true,
      reachable: true,
      ...(body.version ? { version: body.version } : {}),
      ...(typeof body.queueDepth === 'number' ? { queueDepth: body.queueDepth } : {}),
      ...(body.adapters ? { adapters: body.adapters } : {}),
      ...(body.v2?.adapters ? { v2Adapters: body.v2.adapters } : {}),
      scraplingReady: body.scraplingReady === true,
      scraplingConfigured: body.scraplingConfigured === true,
      ...(body.scraplingStatus ? { scraplingStatus: body.scraplingStatus } : {}),
      ...(body.scraplingReason ? { scraplingReason: body.scraplingReason } : {}),
    };
  } catch {
    return { paired: false, reachable: false };
  }
}

export async function pairRunner(token: string): Promise<Result<{ paired: true }>> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
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

export interface ChannelWatchRunnerDefinition {
  channelId: string;
  revision: number;
  schedule: { kind: 'interval'; everyMinutes: number; startAt: string };
  sourceId: string;
  workspaceId: string;
  actionHash: string;
}

export interface RunnerV2Job {
  id: string;
  status: 'queued' | 'leased' | 'running' | 'completed' | 'failed' | 'cancelled';
  envelope?: {
    workspaceId?: string;
    workItemId?: string;
    workItemRevision?: number;
    adapter?: string;
    boundedPrompt?: string;
    createdAt?: string;
  };
  result?: { exitCode?: number; stdout?: string; stderr?: string; status?: string };
  lastError?: string | null;
  createdAt?: string;
}

function runnerHttpFailure(response: Response): Result<never> {
  if (response.status === 401) return fail('approval_required', 'Runner pairing token missing or invalid');
  if (response.status === 404) return fail('not_found', 'Runner channel watch was not found');
  if (response.status === 409) return fail('conflict', 'Runner channel watch changed; refresh and try again');
  return fail('temporary', `Runner returned ${response.status}`);
}

type ChannelWatchRunnerBinding = Pick<
  ChannelWatchRunnerDefinition,
  'workspaceId' | 'sourceId' | 'revision' | 'actionHash'
>;

function channelWatchQuery(definition: ChannelWatchRunnerBinding): string {
  return new URLSearchParams({
    workspaceId: definition.workspaceId,
    revision: String(definition.revision),
    actionHash: definition.actionHash,
  }).toString();
}

/** Register one user-approved channel watch without replacing unrelated routines. */
export async function registerRunnerChannelWatch(
  definition: ChannelWatchRunnerDefinition,
): Promise<Result<{ routineId: string; actionHash: string }>> {
  try {
    const response = await runnerFetch('/v2/channel-watches', { method: 'POST', body: JSON.stringify(definition) });
    if (!response.ok) return runnerHttpFailure(response);
    const body = (await response.json()) as { routineId?: string; actionHash?: string };
    const expectedRoutineId = `rss-watch:${definition.sourceId}`;
    if (body.routineId !== expectedRoutineId || body.actionHash !== definition.actionHash) {
      return fail('internal', 'Runner did not acknowledge this exact channel watch');
    }
    return ok({ routineId: body.routineId, actionHash: body.actionHash });
  } catch {
    return fail('temporary', 'Runner is not reachable; the channel watch stays saved locally');
  }
}

/** Queue an explicit check. The runner constructs the fixed YouTube RSS URL. */
export async function checkRunnerChannelWatch(
  definition: ChannelWatchRunnerBinding,
): Promise<Result<{ jobId: string }>> {
  try {
    const path = `/v2/channel-watches/${encodeURIComponent(definition.sourceId)}/check`;
    const response = await runnerFetch(path, {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: definition.workspaceId,
        revision: definition.revision,
        actionHash: definition.actionHash,
      }),
    });
    if (!response.ok) return runnerHttpFailure(response);
    const body = (await response.json()) as { jobId?: string };
    return body.jobId ? ok({ jobId: body.jobId }) : fail('internal', 'Runner returned no channel-watch job id');
  } catch {
    return fail('temporary', 'Runner is not reachable; no channel check was queued');
  }
}

export async function pollRunnerV2Job(jobId: string): Promise<Result<RunnerV2Job>> {
  try {
    const response = await runnerFetch(`/v2/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) return runnerHttpFailure(response);
    const body = (await response.json()) as { job?: RunnerV2Job };
    return body.job ? ok(body.job) : fail('internal', 'Runner returned no channel-watch job');
  } catch {
    return fail('temporary', 'Runner is not reachable');
  }
}

/** Read only jobs belonging to one local source watch for idempotent browser reconciliation. */
export async function listRunnerChannelWatchJobs(
  definition: ChannelWatchRunnerBinding,
): Promise<Result<RunnerV2Job[]>> {
  try {
    const query = channelWatchQuery(definition);
    const response = await runnerFetch(`/v2/channel-watches/${encodeURIComponent(definition.sourceId)}/jobs?${query}`);
    if (!response.ok) return runnerHttpFailure(response);
    const body = (await response.json()) as { jobs?: RunnerV2Job[] };
    return Array.isArray(body.jobs) ? ok(body.jobs) : fail('internal', 'Runner returned no channel-watch jobs');
  } catch {
    return fail('temporary', 'Runner is not reachable');
  }
}

/** Remove the persisted local schedule before disabling or archiving a watch. */
export async function unregisterRunnerChannelWatch(
  definition: ChannelWatchRunnerBinding,
): Promise<Result<{ removed: boolean }>> {
  try {
    const query = channelWatchQuery(definition);
    const response = await runnerFetch(`/v2/channel-watches/${encodeURIComponent(definition.sourceId)}?${query}`, { method: 'DELETE' });
    if (!response.ok) return runnerHttpFailure(response);
    const body = (await response.json()) as { removed?: boolean };
    return ok({ removed: body.removed === true });
  } catch {
    return fail('temporary', 'Runner is not reachable; the channel schedule was not removed');
  }
}

// ---------------- Missions and agent hosts (God Mode) ----------------

export type SandboxBoundary = 'process' | 'worktree-process' | 'container' | 'cloud-sandbox' | 'unknown';

export interface RunnerHostProbe {
  hostId: string;
  kind: string;
  executable: string | null;
  available: boolean;
  authenticated: boolean | null;
  version: string | null;
  modes: string[];
  capabilities: string[];
  boundary: SandboxBoundary;
  checkedAt: string | null;
  /** Free-form probe detail from the runner: a string, a list, or a small object. */
  details: unknown;
  status: 'shipped_tested' | 'experimental' | 'designed' | 'unavailable';
}

export type RunnerMissionNodeStatus =
  | 'pending' | 'ready' | 'running' | 'verifying' | 'waiting_for_human' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';

export interface RunnerMissionNode {
  status: RunnerMissionNodeStatus;
  attempts: number;
  jobIds: string[];
  sandbox: { id: string; provider: string; root: string; branchName: string | null; baseCommit: string | null; boundary: SandboxBoundary; basedOn?: string | null; headCommit?: string | null } | null;
  host: { hostId: string; kind: string; version: string | null } | null;
  startedAt: string | null;
  finishedAt: string | null;
  evaluation: { status: 'passed' | 'failed' | 'blocked'; checks: Array<{ id: string; name: string; status: string; detail: string }> } | null;
  lastError: string | null;
}

export interface RunnerMission {
  id: string;
  planId: string;
  missionId: string;
  workspaceId: string;
  status: string;
  revision: number;
  contentHash: string;
  nodes: Record<string, RunnerMissionNode>;
  createdAt: string;
  updatedAt: string;
}

function missionHttpFailure(response: Response): Result<never> {
  if (response.status === 401) return fail('approval_required', 'Runner pairing token missing or invalid');
  if (response.status === 404) return fail('not_found', 'Runner mission was not found');
  if (response.status === 409) return fail('conflict', 'Runner already holds a different version of this mission');
  if (response.status === 400) return fail('validation', `Runner refused the request (${response.status})`);
  return fail('temporary', `Runner returned ${response.status}`);
}

async function missionRequest<T>(path: string, init: RequestInit | undefined, pick: (body: Record<string, unknown>) => T | null, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Result<T>> {
  try {
    const response = await runnerFetch(path, init, timeoutMs);
    if (!response.ok) return missionHttpFailure(response);
    const body = (await response.json()) as Record<string, unknown>;
    const value = pick(body);
    return value === null ? fail('internal', 'Runner returned an unexpected mission payload') : ok(value);
  } catch {
    return fail('temporary', 'Runner is not reachable; nothing was sent');
  }
}

/** Probe records for every known agent host, as the runner observed them. */
export async function listRunnerHosts(): Promise<Result<{ hosts: RunnerHostProbe[]; probedAt: string }>> {
  return missionRequest('/v2/hosts', undefined, (body) =>
    Array.isArray(body.hosts) ? { hosts: body.hosts as RunnerHostProbe[], probedAt: String(body.probedAt ?? '') } : null,
  HOST_PROBE_TIMEOUT_MS);
}

export interface SubmitRunnerMissionInput {
  plan: Record<string, unknown>;
  envelopes: Record<string, Record<string, unknown>>;
}

/** Register a validated plan and its hashed node envelopes; idempotent per plan id and revision. */
export async function submitRunnerMission(input: SubmitRunnerMissionInput): Promise<Result<{ missionRunId: string }>> {
  return missionRequest('/v2/missions', { method: 'POST', body: JSON.stringify(input) }, (body) =>
    typeof body.missionRunId === 'string' ? { missionRunId: body.missionRunId } : null,
  );
}

function pickMission(body: Record<string, unknown>): RunnerMission | null {
  const mission = body.mission as RunnerMission | undefined;
  return mission && typeof mission.id === 'string' ? mission : null;
}

export async function getRunnerMission(missionRunId: string): Promise<Result<RunnerMission>> {
  return missionRequest(`/v2/missions/${encodeURIComponent(missionRunId)}`, undefined, pickMission);
}

export async function startRunnerMission(missionRunId: string): Promise<Result<RunnerMission>> {
  return missionRequest(`/v2/missions/${encodeURIComponent(missionRunId)}/start`, { method: 'POST', body: '{}' }, pickMission);
}

export async function cancelRunnerMission(missionRunId: string): Promise<Result<RunnerMission>> {
  return missionRequest(`/v2/missions/${encodeURIComponent(missionRunId)}/cancel`, { method: 'POST', body: '{}' }, pickMission);
}

export interface RunnerMissionDecision {
  nodeId: string;
  decision: 'approved' | 'rejected';
  approvalId: string;
  contentHash: string;
}

/** Record a human decision on a human_decision node. The browser calls this only after a real ApprovalRecord exists. */
export async function decideRunnerMission(missionRunId: string, decision: RunnerMissionDecision): Promise<Result<RunnerMission>> {
  return missionRequest(`/v2/missions/${encodeURIComponent(missionRunId)}/decisions`, { method: 'POST', body: JSON.stringify(decision) }, pickMission);
}
