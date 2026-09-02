import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import type { ExecutionHost } from '../../src/cherry/workforce/workforce-model.ts';
import { instantiateTemplate } from '../../src/cherry/workforce/mission-templates.ts';
import {
  hostBoundary,
  probeToExecutionHost,
  rankHosts,
  upsertExecutionHosts,
  type RunnerHostProbe,
} from '../../src/cherry/workforce/host-registry-service.ts';

const NOW = '2026-09-02T12:00:00.000Z';

function host(id: string, kind: ExecutionHost['kind'], name: string, capabilities: ExecutionHost['capabilities'], status: ExecutionHost['status'] = 'available'): ExecutionHost {
  return { id, workspaceId: 'ws-1', kind, name, status, capabilities, lastSeenAt: NOW, publicConfig: {}, revision: 1 };
}

const plan = instantiateTemplate('release-mission', { workspaceId: 'ws-1', missionId: 'ms-1', outcome: 'Ship it', constraints: [], repositoryRoot: 'D:/project/fixture' });
const developer = plan.nodes.find((node) => node.id === 'developer-fix')!;
const research = plan.nodes.find((node) => node.id === 'research-competitor')!;

const codex = host('ho-codex', 'codex-cli', 'Codex CLI', ['repository_read', 'repository_write', 'command_execution', 'artifact_write']);
const claude = host('ho-claude', 'claude-cli', 'Claude Code', ['repository_read', 'repository_write', 'command_execution', 'artifact_write']);
const runner = host('ho-runner', 'local-runner', 'Local runner', ['repository_read', 'command_execution', 'verification', 'artifact_write']);
const offline = host('ho-offline', 'codex-cli', 'Offline Codex', ['repository_read', 'repository_write', 'command_execution', 'artifact_write'], 'offline');
const unknown = host('ho-unknown', 'claude-cli', 'Unprobed Claude', ['repository_read', 'repository_write', 'command_execution', 'artifact_write'], 'unknown');

describe('rankHosts', () => {
  it('keeps only available hosts that satisfy every required capability', () => {
    const ranked = rankHosts([runner, codex, claude, offline, unknown], developer, {});
    expect(ranked.map((candidate) => candidate.id)).toEqual(['ho-codex', 'ho-claude']);
    expect(rankHosts([runner], developer, {})).toEqual([]);
    expect(rankHosts([runner, codex], research, {}).map((candidate) => candidate.id)).toEqual(['ho-codex', 'ho-runner']);
  });

  it('puts preferred kinds first, then measured pass rate, then name, and is deterministic', () => {
    const noPreference = { ...research, preferredHostKinds: [] as ExecutionHost['kind'][] };
    expect(rankHosts([runner, claude, codex], noPreference, {}).map((candidate) => candidate.id)).toEqual(['ho-claude', 'ho-codex', 'ho-runner']);
    expect(rankHosts([codex, runner, claude], noPreference, {}).map((candidate) => candidate.id)).toEqual(['ho-claude', 'ho-codex', 'ho-runner']);

    expect(rankHosts([claude, codex], developer, {}).map((candidate) => candidate.id)).toEqual(['ho-codex', 'ho-claude']);
    expect(rankHosts([codex, claude], { ...noPreference, preferredHostKinds: ['claude-cli'] }, {}).map((candidate) => candidate.id)).toEqual(['ho-claude', 'ho-codex']);
    expect(rankHosts([codex, claude], noPreference, { preferredKinds: ['claude-cli'] }).map((candidate) => candidate.id)).toEqual(['ho-claude', 'ho-codex']);

    const measured = rankHosts([claude, codex, runner], noPreference, { passRates: { 'ho-codex': 0.9, 'ho-claude': 0.4 } });
    expect(measured.map((candidate) => candidate.id)).toEqual(['ho-codex', 'ho-claude', 'ho-runner']);
    const tie = rankHosts([claude, codex], noPreference, { passRates: { 'ho-codex': 0.5, 'ho-claude': 0.5 } });
    expect(tie.map((candidate) => candidate.id)).toEqual(['ho-claude', 'ho-codex']);
  });
});

describe('rankHosts fallback tiers', () => {
  it('never lets a manual handoff outrank a host that can do the work when nothing else distinguishes them', () => {
    const noPreference = { ...research, preferredHostKinds: [] as ExecutionHost['kind'][] };
    const manual = host('ho-manual', 'manual', 'A person', runner.capabilities);
    expect(rankHosts([manual, runner], noPreference, {}).map((candidate) => candidate.id)).toEqual(['ho-runner', 'ho-manual']);
    expect(rankHosts([runner, manual], noPreference, {}).map((candidate) => candidate.id)).toEqual(['ho-runner', 'ho-manual']);
    expect(rankHosts([manual], noPreference, {}).map((candidate) => candidate.id)).toEqual(['ho-manual']);
    expect(rankHosts([manual, codex], { ...noPreference, preferredHostKinds: ['manual'] }, {}).map((candidate) => candidate.id)).toEqual(['ho-manual', 'ho-codex']);
  });
});

describe('hostBoundary', () => {
  it('labels the boundary honestly for every host kind', () => {
    expect(hostBoundary('codex-cli', 'git-worktree')).toBe('worktree-process');
    expect(hostBoundary('claude-cli', 'git-worktree')).toBe('worktree-process');
    expect(hostBoundary('codex-cli', 'directory')).toBe('process');
    expect(hostBoundary('claude-cli', 'none')).toBe('process');
    expect(hostBoundary('local-runner', 'git-worktree')).toBe('process');
    expect(hostBoundary('attached-webmcp', 'directory')).toBe('unknown');
    expect(hostBoundary('manual', 'directory')).toBe('unknown');
    expect(hostBoundary('codex-automation-export', 'directory')).toBe('unknown');
  });
});

describe('probeToExecutionHost', () => {
  const probe = (overrides: Partial<RunnerHostProbe> = {}): RunnerHostProbe => ({
    hostId: 'codex',
    kind: 'codex',
    executable: 'codex',
    available: true,
    authenticated: true,
    version: '0.42.0',
    modes: ['exec'],
    capabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write', 'telepathy'],
    boundary: 'worktree-process',
    checkedAt: NOW,
    details: 'codex exec --help read',
    status: 'shipped_tested',
    ...overrides,
  });

  it('maps a probed, authenticated, shipped host to available with known capabilities only', () => {
    const mapped = probeToExecutionHost(probe(), 'ws-1');
    expect(mapped).toMatchObject({ workspaceId: 'ws-1', kind: 'codex-cli', status: 'available', lastSeenAt: NOW, revision: 1 });
    expect(mapped.capabilities).toEqual(['repository_read', 'repository_write', 'command_execution', 'artifact_write']);
    expect(mapped.id).toMatch(/^ho-/);
    expect(mapped.name).toContain('Codex');
    expect(mapped.publicConfig).toMatchObject({ provider: 'codex', version: '0.42.0', boundary: 'worktree-process', probeStatus: 'shipped_tested' });
    expect(Object.values(mapped.publicConfig).every((value) => ['string', 'number', 'boolean'].includes(typeof value))).toBe(true);
  });

  it('never reports availability it did not measure', () => {
    expect(probeToExecutionHost(probe({ checkedAt: null }), 'ws-1').status).toBe('unknown');
    expect(probeToExecutionHost(probe({ available: false }), 'ws-1').status).toBe('offline');
    expect(probeToExecutionHost(probe({ status: 'unavailable', available: false }), 'ws-1').status).toBe('offline');
    expect(probeToExecutionHost(probe({ authenticated: false }), 'ws-1').status).toBe('degraded');
    expect(probeToExecutionHost(probe({ status: 'experimental', hostId: 'kimi', kind: 'kimi' }), 'ws-1').status).toBe('degraded');
    expect(probeToExecutionHost(probe({ status: 'designed', hostId: 'ollama', kind: 'ollama' }), 'ws-1').status).toBe('unknown');
    expect(probeToExecutionHost(probe({ hostId: 'claude', kind: 'claude', authenticated: null }), 'ws-1').status).toBe('available');
  });

  it('maps runner kinds onto the execution host kinds Cherry knows', () => {
    expect(probeToExecutionHost(probe({ hostId: 'claude', kind: 'claude' }), 'ws-1').kind).toBe('claude-cli');
    expect(probeToExecutionHost(probe({ hostId: 'manual', kind: 'manual' }), 'ws-1').kind).toBe('manual');
    const ollama = probeToExecutionHost(probe({ hostId: 'ollama', kind: 'ollama', status: 'designed' }), 'ws-1');
    expect(ollama.kind).toBe('local-runner');
    expect(ollama.publicConfig['provider']).toBe('ollama');
    const a = probeToExecutionHost(probe(), 'ws-1');
    const b = probeToExecutionHost(probe(), 'ws-2');
    expect(a.id).not.toBe(b.id);
    expect(probeToExecutionHost(probe(), 'ws-1').id).toBe(a.id);
  });
});

describe('upsertExecutionHosts', () => {
  beforeEach(() => {
    freshDb();
  });

  it('persists probed hosts with a proof event and bumps revisions on re-probe', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Hosts' }));
    const first = probeToExecutionHost({ hostId: 'claude', kind: 'claude', executable: 'claude', available: true, authenticated: true, version: '2.1.224', modes: ['print'], capabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write'], boundary: 'process', checkedAt: NOW, details: '', status: 'shipped_tested' }, workspace.id);
    const stored = unwrap(await upsertExecutionHosts(workspace.id, [first]));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: first.id, status: 'available', revision: 1 });
    expect(await getDb().executionHosts.get(first.id)).toMatchObject({ status: 'available', revision: 1 });

    const again = unwrap(await upsertExecutionHosts(workspace.id, [{ ...first, status: 'offline', lastSeenAt: '2026-09-02T13:00:00.000Z' }]));
    expect(again[0]).toMatchObject({ status: 'offline', revision: 2 });
    expect(await getDb().executionHosts.where('workspaceId').equals(workspace.id).count()).toBe(1);

    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types.filter((type) => type === 'host.probed')).toHaveLength(2);
  });

  it('refuses hosts that belong to another workspace', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Hosts' }));
    const foreign = { ...codex, workspaceId: 'ws-other' };
    expect(await upsertExecutionHosts(workspace.id, [foreign])).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(await getDb().executionHosts.count()).toBe(0);
  });
});
