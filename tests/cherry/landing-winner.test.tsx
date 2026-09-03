import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import recordedMission from '../../public/media/cherry-demo/recorded-mission.json';
import { canonicalJson } from '../../src/components/showcase/recorded-mission.mjs';
import { Landing } from '../../src/pages/Landing.tsx';

const CHAPTERS = [
  ['01 / PLAN', 'Describe the goal. Review the plan.'],
  ['02 / PARALLEL WORK', 'Independent tasks can run at the same time.'],
  ['03 / SEPARATE WORK AREAS', 'Each task gets its own work area.'],
  ['04 / CHECKS', 'Work is complete only when its checks pass.'],
  ['05 / YOUR APPROVAL', 'Cherry pauses when your approval is required.'],
  ['06 / REUSE', 'Save approved methods as reusable skills.'],
] as const;

function responseWith(body: unknown) {
  return { ok: true, status: 200, json: async () => structuredClone(body) };
}

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

function expectReplayEvidenceWithheld(container: HTMLElement, stateLabel: string) {
  const chapter = (id: string) => {
    const element = container.querySelector<HTMLElement>(`[data-landing-chapter="${id}"]`);
    expect(element).toBeTruthy();
    return element!;
  };

  const seed = chapter('seed');
  const branch = chapter('branch');
  const glasshouse = chapter('glasshouse');
  const harvest = chapter('harvest');

  for (const surface of [seed, branch, glasshouse, harvest]) {
    expect(surface.textContent).toContain(stateLabel);
    expect(surface.querySelector('[role="status"], [role="alert"]')).toBeNull();
  }

  expect(seed.textContent).not.toMatch(/2 tasks|Verified before display|succeeded/i);
  expect(branch.textContent).not.toMatch(/Time both tasks ran|34\.5 seconds|2 tasks ran at the same time/i);
  expect(glasshouse.textContent).not.toMatch(/codex-cli|worktree-process|18774c71|Recorded worker|Isolated worktree/i);
  expect(harvest.textContent).not.toMatch(/✓|passed|verified|node --test/i);
  expect(screen.queryByLabelText('Recorded run summary')).toBeNull();
  expect(container.querySelector('.landing-trust-line')?.textContent).toMatch(/recorded run/i);

  const cabinet = screen.getByTestId('proof-cabinet');
  const codexRun = cabinet.querySelector<HTMLElement>('a[href="/showcase#recorded-mission"]');
  expect(codexRun).toBeTruthy();
  expect(codexRun!.textContent).not.toMatch(/Recorded parallel run|two tasks|separate work areas/i);
  expect(within(codexRun!).queryByText('RECORDED')).toBeNull();
  expect(within(codexRun!).queryByText('VERIFIED')).toBeNull();
  expect(codexRun!.textContent).toMatch(/recording.*details/i);
}

describe('winner landing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseWith(recordedMission)));
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('puts the digest-verified recorded mission in the hero instead of teammate examples', async () => {
    renderLanding();

    expect(screen.getByRole('heading', { level: 1, name: 'One task. An entire AI team.' })).toBeTruthy();
    expect(screen.getByText('Recorded run · verified before display · not live')).toBeTruthy();
    const player = await screen.findByRole(
      'region',
      { name: 'Recorded real Codex run' },
      { timeout: 30_000 },
    );
    expect(player.textContent).toContain('Step 1 of 6');
    expect(player.textContent).toContain(recordedMission.mission.outcome);
    expect(document.querySelector('.landing-hero__summary')?.textContent).toContain('Give Cherry a goal.');
    expect(document.body.textContent).not.toMatch(/Give ChatGPT an outcome/i);
    expect(within(player).getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.queryByTestId('teammate-rail')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/media/cherry-demo/recorded-mission.json', expect.objectContaining({ signal: expect.any(AbortSignal) }));

    const actions = screen.getByTestId('hero-actions');
    expect(within(actions).getByRole('link', { name: 'Plan a project' }).getAttribute('href')).toBe('/studio/control');
    expect(within(actions).getByRole('link', { name: 'See the recorded run' }).getAttribute('href')).toBe('/showcase#recorded-mission');
    expect(screen.getByRole('link', { name: 'Try the guided example' }).getAttribute('href')).toBe('/studio?demo=1');
    const summary = screen.getByLabelText('Recorded run summary');
    expect(summary.textContent).toContain('2 tasks');
    expect(summary.textContent).toContain('2 separate work areas');
    expect(summary.textContent).toContain('34.5 seconds together');
    expect(summary.textContent).toContain('2 checks passed');
    for (const link of within(summary).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href')!)).toBeTruthy();
    }
  });

  it('uses the approved six-chapter sequence and one outcome-first final action', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });

    const chapters = Array.from(container.querySelectorAll<HTMLElement>('[data-landing-chapter]'));
    expect(chapters).toHaveLength(6);
    expect(chapters.map((chapter) => chapter.dataset.landingChapter)).toEqual(['seed', 'branch', 'glasshouse', 'harvest', 'human-seal', 'seed-bank']);
    CHAPTERS.forEach(([marker, heading], index) => {
      expect(chapters[index]!.textContent).toContain(marker);
      expect(within(chapters[index]!).getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    });

    const finalAction = screen.getByTestId('final-action');
    expect(within(finalAction).getByRole('link', { name: 'Plan a project' }).getAttribute('href')).toBe('/studio/control');
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#landing-story');
    expect(screen.getByText('Cherry', { selector: '.landing-nav__wordmark' })).toBeTruthy();
    expect(screen.getByText('Explore', { selector: 'summary' })).toBeTruthy();
  });

  it('surfaces only the four audited flagship demos without adding a seventh chapter', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });

    const cabinet = screen.getByTestId('proof-cabinet');
    const cards = Array.from(cabinet.querySelectorAll<HTMLElement>('[data-verified-demo]'));
    expect(cards).toHaveLength(4);

    const codexRun = within(cabinet).getByRole('link', { name: /Recorded parallel run/i });
    expect(codexRun.getAttribute('href')).toBe('/showcase#recorded-mission');
    expect(within(codexRun).getByText('RECORDED')).toBeTruthy();
    expect(within(codexRun).getByText('VERIFIED')).toBeTruthy();

    const threeLab = within(cabinet).getByRole('link', { name: /Interactive 3D lab/i });
    expect(threeLab.getAttribute('href')).toBe('/lab/cherry-3d/');
    expect(within(threeLab).getByText('RUNNABLE DEMO')).toBeTruthy();
    expect(threeLab.textContent).toContain('Move through three procedural scenes and export their geometry.');
    expect(threeLab.textContent).not.toMatch(/GLB/i);

    const skillRun = within(cabinet).getByRole('link', { name: /Recorded skill workflow/i });
    expect(skillRun.getAttribute('href')).toBe('/showcase#real-run');
    expect(within(skillRun).getByText('RECORDED')).toBeTruthy();
    expect(skillRun.textContent).toContain('pausing for a person to approve it');
    expect(skillRun.textContent).not.toContain('Cherry approve');
    expect(skillRun.textContent).toContain('No AI provider or model was involved');

    const mcpProof = within(cabinet).getByRole('link', { name: /Codex and Cherry connection/i });
    expect(mcpProof.getAttribute('href')).toBe('/compatibility');
    expect(within(mcpProof).getByText('CAPTURED')).toBeTruthy();
    expect(mcpProof.textContent).toContain('local MCP connection');

    expect(container.querySelectorAll('[data-landing-chapter]')).toHaveLength(6);
    expect(cabinet.textContent).toContain('Each demo links to the details behind it.');
    expect(container.textContent).not.toMatch(/AAA|Sora|live ChatGPT|works in ChatGPT|runs inside ChatGPT|(?:Sol|Terra|Luna) (?:executes|runs)/i);
  });

  it('reuses recorded overlap, worktree and verification facts as live HTML', async () => {
    renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });

    expect(screen.getByTestId('recorded-overlap').textContent).toContain('34.5 seconds');
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Separate Git worktree').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/both tasks started from the same saved revision/i)).toBeTruthy();
    expect(screen.getByText(/test suite/i)).toBeTruthy();
    expect(screen.getByText(/Cherry does not publish without you/i)).toBeTruthy();
    expect(screen.getByText(/approve the exact version you reviewed/i)).toBeTruthy();
  });

  it('uses only declared responsive Chronicle assets with intrinsic dimensions', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('[data-chronicle-art] img'));
    expect(images).toHaveLength(5);
    for (const image of images) {
      expect(image.getAttribute('src')).toMatch(/^\/media\/cherry-chronicle\/artifacts\/.+-desktop\.svg$/);
      expect(image.getAttribute('width')).toBe('1600');
      expect(image.getAttribute('height')).toBe('1000');
      expect(image.getAttribute('alt')).not.toBe('');
      const source = image.closest('picture')!.querySelector('source');
      expect(source?.getAttribute('srcset')).toMatch(/^\/media\/cherry-chronicle\/artifacts\/.+-mobile\.svg$/);
      expect(source?.getAttribute('media')).toBe('(max-width: 767px)');
    }
    expect(container.innerHTML).not.toMatch(/cherry-editorial|hermes|grok/i);
  });

  it('withholds every replay-derived fact while verification is loading', () => {
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const { container } = renderLanding();

    expectReplayEvidenceWithheld(container, 'Checking recorded run');
  });

  it('withholds every replay-derived fact after a fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network unavailable'));
    const { container } = renderLanding();

    expect((await screen.findByRole('alert')).textContent).toMatch(/recorded run could not be verified/i);
    expectReplayEvidenceWithheld(container, 'Recorded run unavailable');
  });

  it('withholds every replay-derived fact after a replay fails the independent W3 digest pin', async () => {
    const forged = structuredClone(recordedMission);
    forged.mission.outcome = 'Forged landing claim';
    const { integrity: omittedIntegrity, ...unsignedReplay } = forged;
    void omittedIntegrity;
    forged.integrity.replaySha256 = createHash('sha256').update(canonicalJson(unsignedReplay)).digest('hex');
    vi.mocked(fetch).mockResolvedValueOnce(responseWith(forged) as Response);
    const { container } = renderLanding();

    expect((await screen.findByRole('alert')).textContent).toMatch(/recorded run could not be verified/i);
    expect(screen.queryByRole('region', { name: 'Recorded real Codex run' })).toBeNull();
    expect(screen.queryByText('Forged landing claim')).toBeNull();
    expectReplayEvidenceWithheld(container, 'Recorded run unavailable');
  });

  it('updates and cleans up the player reduced-motion preference after mount', async () => {
    let reducedMotion = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const addEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    });
    const removeEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    });
    const mediaQuery = {
      get matches() { return reducedMotion; },
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery));

    const { container, unmount } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    const replay = container.querySelector<HTMLElement>('.landing-replay');
    expect(replay).toBeTruthy();
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(replay!.dataset.reducedMotion).toBe('false');

    act(() => {
      reducedMotion = true;
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent);
    });

    expect(replay!.dataset.reducedMotion).toBe('true');
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(listeners.size).toBe(0);
  });

  it('keeps claims honest and Landing styling free of prohibited effects', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/Live now|Download for Windows|pricing|24\/7|signed receipt|fully replaces/i);
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    const css = readFileSync(resolve('src/design-system/landing.css'), 'utf8');
    expect(css).not.toMatch(/gradient\s*\(|backdrop-filter|filter:\s*blur/i);
  });

  it('uses plain language around the detailed replay', async () => {
    const { container } = renderLanding();
    await screen.findByRole('region', { name: 'Recorded real Codex run' });
    const firstTimeCopy = Array.from(container.querySelectorAll<HTMLElement>([
      '.landing-hero__copy',
      '.landing-chapter__copy',
      '.landing-proof-cabinet__heading',
      '.landing-human-seal',
      '.landing-archive-note',
      '.landing-final',
      '.landing-footer',
    ].join(','))).map((element) => element.textContent ?? '').join(' ');

    expect(firstTimeCopy).not.toMatch(/digest pin|bounded|worker boundary|host identity|committed evidence|orchestration|exact-revision/i);
    expect(firstTimeCopy).toContain('Supervised work on your computer');
    expect(firstTimeCopy).toContain('Pair your computer when you are ready to start live work.');
  });

  it('keeps the recorded player keyboard-operable in the first experience', async () => {
    renderLanding();
    const player = await screen.findByRole(
      'region',
      { name: 'Recorded real Codex run' },
      { timeout: 30_000 },
    );
    fireEvent.click(within(player).getByRole('button', { name: 'Next step' }));
    expect(player.textContent).toContain('Step 2 of 6');
    expect(player.textContent).toContain('Plan bounded');
  });
});
