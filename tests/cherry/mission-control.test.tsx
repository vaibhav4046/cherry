import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { freshDb } from '../setup.ts';
import { AppStateProvider } from '../../src/app/AppState.tsx';
import MissionControl from '../../src/pages/studio/MissionControl.tsx';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { listMissionPlans } from '../../src/cherry/workforce/mission-plan-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

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

  it('asks for a space first, then shows the outcome composer', async () => {
    renderControl();
    await screen.findByTestId('control-empty');
    fireEvent.change(screen.getByLabelText('Space name'), { target: { value: 'Missions test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create space' }));
    await screen.findByTestId('outcome-composer');
    expect(screen.getByRole('heading', { level: 1, name: 'What should Cherry take care of?' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('runner-line').textContent).toMatch(/No runner detected/));
  });

  it('plans a mission from an outcome, persists it, and moves to the detail route', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Composer test' }));
    localStorage.setItem('cherry.activeWorkspaceId', workspace.id);
    renderControl('/studio/control?outcome=Audit%20this%20repository%20and%20fix%20the%20highest-impact%20defect.');
    const input = await screen.findByTestId('outcome-input');
    expect((input as HTMLTextAreaElement).value).toBe('Audit this repository and fix the highest-impact defect.');
    fireEvent.click(screen.getByTestId('plan-mission'));
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
    (input as HTMLTextAreaElement).removeAttribute('minlength');
    fireEvent.change(input, { target: { value: 'Fix it' } });
    fireEvent.submit(screen.getByTestId('outcome-composer'));
    await screen.findByRole('alert');
    expect(await listMissionPlans(workspace.id)).toHaveLength(0);
  });
});
