import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import recordedMission from '../../public/media/cherry-demo/recorded-mission.json';
import { Landing } from '../../src/pages/Landing.tsx';

function renderLanding() {
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

describe('landing claim compatibility', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => structuredClone(recordedMission),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('replaces the obsolete eleven-section and teammate-first rhythm', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    expect(container.querySelectorAll('[data-landing-chapter]')).toHaveLength(6);
    expect(screen.queryByTestId('teammate-rail')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Describe the result. Cherry forms the team.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Successful work improves the next mission.' })).toBeTruthy();
  });

  it('retains the existing public-claim guardrails', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    const text = container.textContent ?? '';
    expect(text).toContain('Recording · committed evidence · not live');
    expect(text).toContain('runs while your paired computer is online');
    expect(text).not.toMatch(/Download for Windows|24\/7|laptop is closed|Connected to LinkedIn|signed receipt/i);
  });

  it('uses Chronicle assets and live text instead of copied competitor art', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    expect(container.querySelectorAll('[data-chronicle-art] img')).toHaveLength(5);
    expect(container.innerHTML).not.toMatch(/cherry-editorial|hermes|grok/i);
  });
});
