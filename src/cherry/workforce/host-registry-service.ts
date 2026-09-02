/**
 * Host registry: ranks execution hosts for a plan node, labels their sandbox
 * boundary honestly, maps runner probe records onto ExecutionHost, and
 * persists probe results with a ProofEvent. A host is 'available' only when a
 * probe measured it; nothing here invents availability.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { isValidId } from '../core/ids.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import {
  RUNTIME_CAPABILITIES,
  hostSatisfies,
  type ExecutionHost,
  type ExecutionHostKind,
  type RuntimeCapability,
} from './workforce-model.ts';
import type { MissionPlanNode, SandboxBoundary, SandboxProvider } from './mission-plan-model.ts';

// ---------------- Ranking ----------------

export interface HostRankingPreferences {
  /** Used when the node itself states no preference. */
  preferredKinds?: readonly ExecutionHostKind[];
  /** Measured pass rate per host id (0..1). Hosts without a measurement rank last. */
  passRates?: Readonly<Record<string, number>>;
}

/**
 * Deterministic order: unavailable hosts are dropped, then every host must
 * satisfy the node's capabilities; preferred kinds first, then measured pass
 * rate (unknown last), then name, then id.
 */
export function rankHosts(hosts: readonly ExecutionHost[], node: MissionPlanNode, prefs: HostRankingPreferences = {}): ExecutionHost[] {
  const preferred = node.preferredHostKinds.length > 0 ? node.preferredHostKinds : prefs.preferredKinds ?? [];
  const preferenceRank = (host: ExecutionHost): number => {
    const index = preferred.indexOf(host.kind);
    return index === -1 ? preferred.length : index;
  };
  const passRate = (host: ExecutionHost): number => {
    const rate = prefs.passRates?.[host.id];
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : -1;
  };
  return hosts
    .filter((host) => host.status === 'available' && hostSatisfies(host, node.requiredCapabilities))
    .sort((a, b) => preferenceRank(a) - preferenceRank(b)
      || passRate(b) - passRate(a)
      || fallbackRank(a.kind) - fallbackRank(b.kind)
      || a.name.localeCompare(b.name)
      || a.id.localeCompare(b.id));
}

/**
 * With no preference and no history, hosts that run the work on this machine share one tier and the
 * name decides; hand-offs through another surface come next; a person's manual handoff is always last.
 */
const KIND_FALLBACK_RANK: Readonly<Record<ExecutionHostKind, number>> = {
  'codex-cli': 0,
  'claude-cli': 0,
  'local-runner': 0,
  'attached-webmcp': 1,
  'codex-automation-export': 1,
  manual: 2,
};

function fallbackRank(kind: ExecutionHostKind): number {
  return KIND_FALLBACK_RANK[kind] ?? 1;
}

// ---------------- Boundaries ----------------

/** The isolation a host kind really provides for a node's sandbox; never more than the code enforces. */
export function hostBoundary(kind: ExecutionHostKind, sandbox: SandboxProvider = 'directory'): SandboxBoundary {
  switch (kind) {
    case 'codex-cli':
    case 'claude-cli':
      return sandbox === 'git-worktree' ? 'worktree-process' : 'process';
    case 'local-runner':
      return 'process';
    case 'attached-webmcp':
    case 'codex-automation-export':
    case 'manual':
      return 'unknown';
  }
}

// ---------------- Probes ----------------

export type RunnerHostProbeStatus = 'shipped_tested' | 'experimental' | 'designed' | 'unavailable';

/** The record the runner returns from GET /v2/hosts (ARCHITECTURE.md 4.3). */
export interface RunnerHostProbe {
  hostId: string;
  kind: string;
  executable: string | null;
  available: boolean;
  authenticated: boolean | null;
  version: string | null;
  modes: string[];
  capabilities: string[];
  boundary: string;
  checkedAt: string | null;
  details: string;
  status: RunnerHostProbeStatus;
}

const PROBE_KIND_TO_HOST_KIND: Readonly<Record<string, ExecutionHostKind>> = {
  codex: 'codex-cli',
  claude: 'claude-cli',
  manual: 'manual',
};

const PROBE_KIND_LABEL: Readonly<Record<string, string>> = {
  codex: 'Codex CLI',
  claude: 'Claude Code',
  kilo: 'Kilo',
  kimi: 'Kimi',
  ollama: 'Ollama',
  omniroute: 'OmniRoute',
  'openai-compatible': 'OpenAI-compatible endpoint',
  mock: 'Mock host',
  manual: 'Manual handoff',
};

function safeIdSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._:-]/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 40) : 'host';
}

function probeStatus(probe: RunnerHostProbe): ExecutionHost['status'] {
  if (!probe.checkedAt) return 'unknown';
  if (probe.status === 'unavailable' || !probe.available) return 'offline';
  if (probe.status === 'designed') return 'unknown';
  if (probe.authenticated === false) return 'degraded';
  if (probe.status === 'experimental') return 'degraded';
  return 'available';
}

/** Maps a runner probe onto an ExecutionHost. Unknown provider kinds run through the local runner process. */
export function probeToExecutionHost(probe: RunnerHostProbe, workspaceId: string): ExecutionHost {
  const kind = PROBE_KIND_TO_HOST_KIND[probe.kind] ?? 'local-runner';
  const capabilities = probe.capabilities.filter((capability): capability is RuntimeCapability => (RUNTIME_CAPABILITIES as readonly string[]).includes(capability));
  const label = PROBE_KIND_LABEL[probe.kind] ?? probe.kind;
  return {
    id: `ho-${safeIdSegment(probe.hostId)}-${safeIdSegment(workspaceId)}`,
    workspaceId,
    kind,
    name: probe.version ? `${label} ${probe.version}` : label,
    status: probeStatus(probe),
    capabilities: [...new Set(capabilities)],
    lastSeenAt: probe.checkedAt,
    publicConfig: {
      provider: probe.kind,
      executable: probe.executable ?? '',
      version: probe.version ?? '',
      boundary: probe.boundary,
      probeStatus: probe.status,
      authenticated: probe.authenticated === true,
      modes: probe.modes.join(','),
      details: probe.details.slice(0, 200),
    },
    revision: 1,
  };
}

// ---------------- Persistence ----------------

/** Stores probe results in the executionHosts table; every host change emits host.probed in the same transaction. */
export async function upsertExecutionHosts(workspaceId: string, hosts: readonly ExecutionHost[]): Promise<Result<ExecutionHost[]>> {
  for (const host of hosts) {
    if (host.workspaceId !== workspaceId) return err('validation', `Host ${host.id} belongs to another workspace.`);
    if (!isValidId(host.id)) return err('validation', `Host id "${host.id}" is not a valid identifier.`);
  }
  return withWorkspaceTx(workspaceId, ['executionHosts'], async (ctx) => {
    const stored: ExecutionHost[] = [];
    for (const host of hosts) {
      const existing = await ctx.db.executionHosts.get(host.id);
      if (existing && existing.workspaceId !== workspaceId) return err('validation', `Host ${host.id} belongs to another workspace.`);
      const next: ExecutionHost = { ...host, revision: existing ? existing.revision + 1 : 1 };
      await ctx.db.executionHosts.put(next);
      stored.push(next);
      ctx.emit({
        type: 'host.probed',
        actorType: 'runner',
        objectType: 'executionHost',
        objectId: next.id,
        summary: `Host "${next.name}" probed: ${next.status} (${next.kind}, r${next.revision})`,
        payload: { kind: next.kind, status: next.status, capabilities: [...next.capabilities], lastSeenAt: next.lastSeenAt, executionHostId: next.id },
      });
    }
    return ok(stored);
  });
}

export async function listExecutionHosts(workspaceId: string): Promise<ExecutionHost[]> {
  const hosts = await getDb().executionHosts.where('workspaceId').equals(workspaceId).toArray();
  return hosts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
