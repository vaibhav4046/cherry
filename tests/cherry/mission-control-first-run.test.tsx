import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppStateProvider, useAppState } from '../../src/app/AppState.tsx';
import MissionControl from '../../src/pages/studio/MissionControl.tsx';
import MissionControlDetail from '../../src/pages/studio/MissionControlDetail.tsx';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, listWorkspaces } from '../../src/cherry/mission/mission-service.ts';
import { createMission, listMissionCards } from '../../src/cherry/workforce/mission-control-service.ts';
import { listMissionPlans } from '../../src/cherry/workforce/mission-plan-service.ts';
import { freshDb } from '../setup.ts';

const runnerApi = vi.hoisted(() => ({
  status: vi.fn(),
  hosts: vi.fn(),
}));

vi.mock('../../src/cherry/runner-client/runner-api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cherry/runner-client/runner-api.ts')>();
  return {
    ...actual,
    runnerStatus: runnerApi.status,
    listRunnerHosts: runnerApi.hosts,
  };
});

const ELIGIBLE_HOST = {
  hostId: 'codex-e2e',
  kind: 'codex',
  executable: 'codex',
  available: true,
  authenticated: true,
  version: 'codex 1.0.0',
  modes: ['worktree'],
  capabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write', 'verification'],
  boundary: 'worktree-process',
  checkedAt: '2026-09-02T20:00:00.000Z',
  details: 'ready',
  status: 'shipped_tested',
} as const;

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
  beforeEach(() => {
    freshDb();
    localStorage.clear();
    runnerApi.status.mockReset().mockResolvedValue({ reachable: false, paired: false });
    runnerApi.hosts.mockReset().mockResolvedValue({
      ok: false,
      error: { code: 'temporary', message: 'Runner is not reachable' },
    });
  });

  afterEach(() => {
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
    expect((await screen.findByTestId('location-probe')).textContent).toBe('/showcase#recorded-codex-mission');
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
  beforeEach(() => {
    freshDb();
    localStorage.clear();
    runnerApi.status.mockReset();
    runnerApi.hosts.mockReset();
  });

  afterEach(() => {
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
        hosts: [{ ...ELIGIBLE_HOST, hostId: 'missing-capabilities', capabilities: [] }],
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
      value: { hosts: [ELIGIBLE_HOST], probedAt: '2026-09-02T20:00:00.000Z' },
    });
    const seeded = await seedMission('Research this market and produce an evidence-backed launch brief.');
    renderDetail(seeded.mission.id);

    expect(await screen.findByTestId('start-mission')).toBeTruthy();
  });

  it('withholds live start until a consequential plan is approved by a person', async () => {
    runnerApi.status.mockResolvedValue({ reachable: true, paired: true });
    runnerApi.hosts.mockResolvedValue({
      ok: true,
      value: { hosts: [ELIGIBLE_HOST], probedAt: '2026-09-02T20:00:00.000Z' },
    });
    const seeded = await seedMission('Ship the release, fix the onboarding defect, and prepare launch content.');
    renderDetail(seeded.mission.id);

    await screen.findByTestId('approve-plan');
    expect(screen.queryByTestId('start-mission')).toBeNull();
    fireEvent.click(screen.getByTestId('approve-plan'));
    expect(await screen.findByTestId('start-mission')).toBeTruthy();
  });
});
