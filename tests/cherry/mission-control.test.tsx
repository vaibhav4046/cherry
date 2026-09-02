import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { freshDb } from '../setup.ts';
import { AppStateProvider } from '../../src/app/AppState.tsx';
import MissionControl from '../../src/pages/studio/MissionControl.tsx';
import { createWorkspace, listWorkspaces } from '../../src/cherry/mission/mission-service.ts';
import { listMissionPlans } from '../../src/cherry/workforce/mission-plan-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

async function waitForPlanning(): Promise<HTMLButtonElement> {
  const button = screen.getByTestId('plan-mission') as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

function renderControl(initialEntry = '/studio/control') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppStateProvider>
        <Routes>
          <Route path="/studio/control" element={<MissionControl />} />
          <Route path="/studio/control/:missionId" element={<p data-testid="detail-route">detail</p>} />
        </Routes>
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe('Mission Control page', () => {
  beforeEach(() => {
    freshDb();
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates My Cherry from the first outcome instead of asking for a space first', async () => {
    renderControl();
    const input = await screen.findByTestId('outcome-input');
    expect(screen.getByRole('heading', { level: 1, name: 'What should Cherry take care of?' })).toBeTruthy();
    expect(screen.queryByLabelText('Space name')).toBeNull();
    fireEvent.change(input, { target: { value: 'Research this market and produce an evidence-backed launch brief.' } });
    fireEvent.click(await waitForPlanning());
    await screen.findByTestId('detail-route');
    await waitFor(async () => {
      const workspaces = await listWorkspaces();
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]!.name).toBe('My Cherry');
    });
  });

  it('plans a mission from an outcome, persists it, and moves to the detail route', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Composer test' }));
    localStorage.setItem('cherry.activeWorkspaceId', workspace.id);
    renderControl('/studio/control?outcome=Audit%20this%20repository%20and%20fix%20the%20highest-impact%20defect.');
    const input = await screen.findByTestId('outcome-input');
    expect((input as HTMLTextAreaElement).value).toBe('Audit this repository and fix the highest-impact defect.');
    fireEvent.click(await waitForPlanning());
    await screen.findByTestId('detail-route');
    await waitFor(async () => {
      const plans = await listMissionPlans(workspace.id);
      expect(plans).toHaveLength(1);
      expect(plans[0]!.templateId).toBe('repository-audit');
      expect(plans[0]!.nodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('rejects an outcome that is too short with a visible error and no persisted plan', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Short test' }));
    localStorage.setItem('cherry.activeWorkspaceId', workspace.id);
    renderControl();
    const input = await screen.findByTestId('outcome-input');
    await waitForPlanning();
    (input as HTMLTextAreaElement).removeAttribute('minlength');
    fireEvent.change(input, { target: { value: 'Fix it' } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));
    await screen.findByRole('alert');
    expect(await listMissionPlans(workspace.id)).toHaveLength(0);
  });
});
