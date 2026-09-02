import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider, useAppState } from '../../src/app/AppState.tsx';
import MissionControl from '../../src/pages/studio/MissionControl.tsx';
import MissionControlDetail from '../../src/pages/studio/MissionControlDetail.tsx';
import { LiveStartGate } from '../../src/components/studio/mission-control/LiveStartGate.tsx';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, listMissions, listWorkspaces } from '../../src/cherry/mission/mission-service.ts';
import { createMission, listMissionCards } from '../../src/cherry/workforce/mission-control-service.ts';
import { listMissionPlans } from '../../src/cherry/workforce/mission-plan-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { freshDb } from '../setup.ts';

const runnerApi = vi.hoisted(() => ({
  status: vi.fn(),
  hosts: vi.fn(),
}));

const missionApi = vi.hoisted(() => ({
  create: vi.fn(),
}));

const workspaceApi = vi.hoisted(() => ({
  remove: vi.fn(),
}));

const appStateApi = vi.hoisted(() => ({
  refresh: null as null | (() => Promise<void>),
}));

vi.mock('../../src/app/AppState.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/AppState.tsx')>();
  return {
    ...actual,
    useAppState: () => {
      const state = actual.useAppState();
      return appStateApi.refresh === null ? state : { ...state, refresh: appStateApi.refresh };
    },
  };
});

vi.mock('../../src/cherry/runner-client/runner-api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cherry/runner-client/runner-api.ts')>();
  return {
    ...actual,
    runnerStatus: runnerApi.status,
    listRunnerHosts: runnerApi.hosts,
  };
});

vi.mock('../../src/cherry/workforce/mission-control-service.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cherry/workforce/mission-control-service.ts')>();
  return { ...actual, createMission: missionApi.create };
});

vi.mock('../../src/cherry/mission/mission-service.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cherry/mission/mission-service.ts')>();
  return { ...actual, deleteWorkspace: workspaceApi.remove };
});

function eligibleHost(checkedAt = new Date().toISOString()) {
  return {
  hostId: 'codex-e2e',
  kind: 'codex',
  executable: 'codex',
  available: true,
  authenticated: true,
  version: 'codex 1.0.0',
  modes: ['worktree'],
  capabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write', 'verification'],
  boundary: 'worktree-process',
  checkedAt,
  details: 'ready',
  status: 'shipped_tested',
  } as const;
}

async function resetServiceDoubles() {
  const missionService = await vi.importActual<typeof import('../../src/cherry/workforce/mission-control-service.ts')>(
    '../../src/cherry/workforce/mission-control-service.ts',
  );
  const workspaceService = await vi.importActual<typeof import('../../src/cherry/mission/mission-service.ts')>(
    '../../src/cherry/mission/mission-service.ts',
  );
  missionApi.create.mockReset().mockImplementation(missionService.createMission);
  workspaceApi.remove.mockReset().mockImplementation(workspaceService.deleteWorkspace);
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-probe">{location.pathname}{location.hash}</p>;
}

function ReadyControl() {
  const { ready } = useAppState();
  return ready ? <MissionControl /> : <p role="status">Loading Mission Control</p>;
}

function renderControl(initialEntry = '/studio/control') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppStateProvider>
        <Routes>
          <Route path="/studio/control" element={<ReadyControl />} />
          <Route path="/studio/control/:missionId" element={<p data-testid="detail-route">detail</p>} />
          <Route path="/showcase" element={<LocationProbe />} />
        </Routes>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

function renderDetail(missionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/studio/control/${missionId}`]}>
      <AppStateProvider>
        <Routes>
          <Route path="/studio/control/:missionId" element={<MissionControlDetail />} />
        </Routes>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

async function seedMission(outcome: string) {
  const workspace = unwrap(await createWorkspace({ name: 'Existing Cherry' }));
  const created = unwrap(await createMission({ workspaceId: workspace.id, outcome }));
  localStorage.setItem('cherry.activeWorkspaceId', workspace.id);
  return { workspace, ...created };
}

describe('Mission Control first run', () => {
  beforeEach(async () => {
    freshDb();
    localStorage.clear();
    appStateApi.refresh = null;
    await resetServiceDoubles();
    runnerApi.status.mockReset().mockResolvedValue({ reachable: false, paired: false });
    runnerApi.hosts.mockReset().mockResolvedValue({
      ok: false,
      error: { code: 'temporary', message: 'Runner is not reachable' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('turns one valid first outcome into My Cherry and a persisted plan', async () => {
    renderControl();

    const input = await screen.findByTestId('outcome-input');
    expect(screen.queryByLabelText('Space name')).toBeNull();
    fireEvent.change(input, { target: { value: 'Research this market and produce an evidence-backed launch brief.' } });
    fireEvent.click(screen.getByTestId('plan-mission'));

    await screen.findByTestId('detail-route');
    await waitFor(async () => {
      const workspaces = await listWorkspaces();
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]!.name).toBe('My Cherry');
      expect(await listMissionPlans(workspaces[0]!.id)).toHaveLength(1);
    });
  });

  it('keeps the first outcome recoverable and creates no workspace when validation fails', async () => {
    renderControl();

    const input = await screen.findByTestId('outcome-input');
    (input as HTMLTextAreaElement).removeAttribute('minlength');
    fireEvent.change(input, { target: { value: 'Fix it' } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Describe the result/);
    expect((input as HTMLTextAreaElement).value).toBe('Fix it');
    expect(await listWorkspaces()).toHaveLength(0);
  });

  it('rolls back the workspace and every partial mission record when first-run planning throws', async () => {
    const actual = await vi.importActual<typeof import('../../src/cherry/workforce/mission-control-service.ts')>(
      '../../src/cherry/workforce/mission-control-service.ts',
    );
    let createdWorkspaceId = '';
    missionApi.create.mockImplementationOnce(async (input) => {
      createdWorkspaceId = input.workspaceId;
      const partial = await actual.createMission(input);
      expect(partial.ok).toBe(true);
      throw new Error('createMission failed after persistence');
    });
    renderControl();

    const input = await screen.findByTestId('outcome-input');
    fireEvent.change(input, { target: { value: 'Research this market and produce an evidence-backed launch brief.' } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/unfinished My Cherry space was removed/i);
    expect((input as HTMLTextAreaElement).value).toBe('Research this market and produce an evidence-backed launch brief.');
    expect(createdWorkspaceId).not.toBe('');
    expect(await listWorkspaces()).toHaveLength(0);
    expect(await listMissionPlans(createdWorkspaceId)).toHaveLength(0);
    expect(await listMissionCards(createdWorkspaceId)).toHaveLength(0);
    expect(await listProofEvents(createdWorkspaceId, 100)).toHaveLength(0);
    expect(localStorage.getItem('cherry.activeWorkspaceId')).toBeNull();
    expect(localStorage.getItem('cherry.activeMissionId')).toBeNull();
  });

  it('keeps recovery honest when compensating workspace cleanup also fails', async () => {
    missionApi.create.mockRejectedValueOnce(new Error('planning failed'));
    workspaceApi.remove.mockResolvedValueOnce({
      ok: false,
      error: { code: 'conflict', message: 'Cleanup refused' },
    });
    renderControl();

    const input = await screen.findByTestId('outcome-input');
    fireEvent.change(input, { target: { value: 'Research this market and produce an evidence-backed launch brief.' } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not remove.*Cleanup refused/i);
    expect((input as HTMLTextAreaElement).value).toBe('Research this market and produce an evidence-backed launch brief.');
    expect(await listWorkspaces()).toHaveLength(1);
    expect(localStorage.getItem('cherry.activeWorkspaceId')).toBeNull();
    expect(localStorage.getItem('cherry.activeMissionId')).toBeNull();
  });

  it('preserves a saved first mission when the post-save AppState refresh fails', async () => {
    const outcome = 'Research this market and produce an evidence-backed launch brief.';
    let rejectRefresh = (_reason: Error) => {};
    const refreshFailure = new Promise<void>((_resolve, reject) => {
      rejectRefresh = reject;
    });
    const rejectedRefresh = vi.fn().mockReturnValue(refreshFailure);
    appStateApi.refresh = rejectedRefresh;
    renderControl();

    const input = await screen.findByTestId('outcome-input');
    fireEvent.change(input, { target: { value: outcome } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));
    await waitFor(() => expect(rejectedRefresh).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectRefresh(new Error('AppState refresh failed'));
      await Promise.resolve();
    });

    expect((await screen.findByRole('alert')).textContent).toMatch(/mission was saved.*refresh.*reload/i);
    expect((input as HTMLTextAreaElement).value).toBe(outcome);
    const workspaces = await listWorkspaces();
    expect(workspaces).toHaveLength(1);
    const workspace = workspaces[0]!;
    const missions = await listMissions(workspace.id);
    expect(missions).toHaveLength(1);
    expect(await listMissionPlans(workspace.id)).toHaveLength(1);
    expect(await listMissionCards(workspace.id)).toHaveLength(1);
    expect((await listProofEvents(workspace.id, 100)).some((event) => event.type === 'mission.plan_created')).toBe(true);
    expect(workspaceApi.remove).not.toHaveBeenCalled();
    expect(localStorage.getItem('cherry.activeWorkspaceId')).toBe(workspace.id);
    expect(localStorage.getItem('cherry.activeMissionId')).toBe(missions[0]!.id);
    await waitFor(() => expect(screen.getByTestId('plan-mission').getAttribute('aria-busy')).toBe('false'));
    expect(screen.queryByTestId('detail-route')).toBeNull();
  });

  it('keeps execution controls collapsed and opens the recorded replay without a runner', async () => {
    renderControl();

    await screen.findByTestId('outcome-composer');
    const settings = screen.getByTestId('execution-settings') as HTMLDetailsElement;
    expect(settings.open).toBe(false);
    fireEvent.click(screen.getByText('Execution settings'));
    expect(settings.open).toBe(true);
    expect(screen.getByTestId('template-select')).toBeTruthy();
    expect(screen.getByTestId('repository-input')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /Replay the verified Codex mission/i }));
    expect((await screen.findByTestId('location-probe')).textContent).toBe('/showcase#recorded-mission');
  });

  it('rechecks runner status whenever Execution settings is reopened', async () => {
    runnerApi.status
      .mockResolvedValueOnce({ reachable: false, paired: false })
      .mockResolvedValueOnce({ reachable: true, paired: true });
    renderControl();

    await screen.findByTestId('outcome-composer');
    fireEvent.click(screen.getByText('Execution settings'));
    expect(await screen.findByText(/No runner detected/)).toBeTruthy();
    fireEvent.click(screen.getByText('Execution settings'));
    fireEvent.click(screen.getByText('Execution settings'));
    expect(await screen.findByText(/Runner paired/)).toBeTruthy();
    expect(runnerApi.status).toHaveBeenCalledTimes(2);
  });

  it('does not introduce a nested main landmark inside the Studio shell', async () => {
    render(
      <main data-testid="studio-shell-main">
        <MemoryRouter initialEntries={['/studio/control']}>
          <AppStateProvider><ReadyControl /></AppStateProvider>
        </MemoryRouter>
      </main>,
    );

    await screen.findByTestId('mission-control');
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('restores the persisted mission board after a remount', async () => {
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    const first = renderControl();
    await waitFor(async () => expect(await listMissionCards(seeded.workspace.id)).toHaveLength(1));
    await screen.findByText('Research this market and produce an evidence-backed launch brief.');

    first.unmount();
    renderControl();
    expect(await screen.findByText('Research this market and produce an evidence-backed launch brief.')).toBeTruthy();
  });
});

describe('Mission Control live-start gate', () => {
  beforeEach(async () => {
    freshDb();
    localStorage.clear();
    await resetServiceDoubles();
    runnerApi.status.mockReset();
    runnerApi.hosts.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('does not offer live start when the runner is unavailable', async () => {
    runnerApi.status.mockResolvedValue({ reachable: false, paired: false });
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    renderDetail(seeded.mission.id);

    await screen.findByTestId('mission-status');
    await waitFor(() => expect(screen.queryByTestId('start-mission')).toBeNull());
  });

  it('does not offer live start when the paired runner has no eligible host', async () => {
    runnerApi.status.mockResolvedValue({ reachable: true, paired: true });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: {
        hosts: [{ ...eligibleHost(), hostId: 'missing-capabilities', capabilities: [] }],
        probedAt: '2026-09-02T20:00:00.000Z',
      },
    });
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    renderDetail(seeded.mission.id);

    await screen.findByTestId('mission-status');
    await waitFor(() => expect(screen.queryByTestId('start-mission')).toBeNull());
  });

  it('offers live start only when runner, pairing, host, plan and policy all allow it', async () => {
    runnerApi.status.mockResolvedValue({ reachable: true, paired: true });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: { hosts: [eligibleHost()], probedAt: new Date().toISOString() },
    });
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    renderDetail(seeded.mission.id);

    expect(await screen.findByTestId('start-mission')).toBeTruthy();
  });

  it('withholds live start until a consequential plan is approved by a person', async () => {
    runnerApi.status.mockResolvedValue({ reachable: true, paired: true });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: { hosts: [eligibleHost()], probedAt: new Date().toISOString() },
    });
    const seeded = await seedMission('Ship the release, fix the onboarding defect, and prepare launch content.');
    renderDetail(seeded.mission.id);

    await screen.findByTestId('approve-plan');
    expect(screen.queryByTestId('start-mission')).toBeNull();
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(await screen.findByTestId('start-mission')).toBeTruthy();
  });

  it('re-probes on focus and hides Start when a paired runner disconnects', async () => {
    runnerApi.status
      .mockResolvedValueOnce({ reachable: true, paired: true })
      .mockResolvedValueOnce({ reachable: false, paired: false });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: { hosts: [eligibleHost()], probedAt: new Date().toISOString() },
    });
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    renderDetail(seeded.mission.id);

    expect(await screen.findByTestId('start-mission')).toBeTruthy();
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByTestId('start-mission')).toBeNull());
    expect(runnerApi.status).toHaveBeenCalledTimes(2);
  });

  it('expires a previously eligible host and re-probes on the bounded interval', async () => {
    vi.useFakeTimers();
    const now = new Date('2030-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    runnerApi.status.mockResolvedValue({ reachable: true, paired: true });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: { hosts: [eligibleHost(now.toISOString())], probedAt: now.toISOString() },
    });
    render(
      <LiveStartGate
        canStart
        policyAllows
        requiredCapabilitySets={[['repository_read']]}
        busy={false}
        onStart={() => undefined}
      />,
    );

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('start-mission')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(screen.queryByTestId('start-mission')).toBeNull();
    expect(runnerApi.status.mock.calls.length).toBeGreaterThan(1);
    vi.useRealTimers();
  });
});
