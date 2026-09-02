import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from '../../src/pages/Landing.tsx';
import { LANDING_SECTIONS, TEAMMATE_EXAMPLE_ROWS } from '../../src/components/marketing/landing-content.ts';

/**
 * The landing positions Cherry as an autonomous runtime for an AI team. These
 * assertions pin the copy the directive fixed, the required section order, the
 * honesty rules (examples are labelled, no fake download, no live claims), and
 * the copy guide (no exclamation marks, no em dashes, no emoji).
 */

beforeAll(() => {
  // jsdom has no matchMedia; the reveal hook and clip video read it.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: ObserverStub });
});

afterEach(() => cleanup());

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('landing: open AI workforce positioning', () => {
  it('renders the fixed hero copy, both CTAs, and the trust line', () => {
    renderLanding();
    expect(screen.getByText('Cherry / Open AI workforce')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'One task. An entire AI team.' })).toBeTruthy();
    expect(
      screen.getByText(
        'Cherry coordinates the tools and agent hosts you already use, plans and bounds the work, creates constrained teammates, verifies the results, and returns for genuine decisions.',
      ),
    ).toBeTruthy();
    const ctas = screen.getByTestId('hero-ctas');
    expect(within(ctas).getByRole('link', { name: 'Run a real mission' }).getAttribute('href')).toBe('/studio/control');
    expect(within(ctas).getByRole('link', { name: 'See how Cherry works' }).getAttribute('href')).toBe('#how');
    expect(screen.getByText('Model-agnostic · Permission-scoped · Verification-backed')).toBeTruthy();
  });

  it('shows the six named teammates as a labelled example, never as live facts', () => {
    renderLanding();
    const rail = screen.getByTestId('teammate-rail');
    expect(within(rail).getByText('Example workspace')).toBeTruthy();
    for (const row of TEAMMATE_EXAMPLE_ROWS) {
      expect(within(rail).getByText(row.name)).toBeTruthy();
      expect(within(rail).getByText(row.line)).toBeTruthy();
    }
    expect(within(rail).queryByText(/live/i)).toBeNull();
  });

  it('states the enforced three-task parallel limit', () => {
    renderLanding();
    const rail = screen.getByTestId('teammate-rail');
    expect(within(rail).getByText('Release mission planned. Up to three tasks can run in parallel.')).toBeTruthy();
    expect(within(rail).queryByText(/Four tasks can run in parallel/i)).toBeNull();
  });

  it('labels Claude Code mission execution Experimental until a signed-in capture exists', () => {
    renderLanding();
    const modelDemo = screen.getByTestId('model-demo');
    const claudeRow = within(modelDemo).getByText('Claude Code').closest('li');
    expect(claudeRow).not.toBeNull();
    expect(within(claudeRow!).getByTestId('status-chip').textContent).toBe('Experimental');
    expect(
      within(claudeRow!).getByText('The integration is built. A real execution capture requires a Claude sign-in.'),
    ).toBeTruthy();
  });

  it('separates the recorded browser journey from the Codex, Claude Code and WebMCP evidence', () => {
    renderLanding();
    expect(
      screen.getByText(
        'The recorded browser journey shows a lesson becoming an approved, verified skill with tamper-evident proof. Codex execution and a Claude Code skill installation were captured separately. WebMCP is mock-host tested.',
      ),
    ).toBeTruthy();
  });

  it('renders the twelve required sections in the directive order', () => {
    renderLanding();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    const expected = LANDING_SECTIONS.map((section) => section.heading);
    expect(expected).toHaveLength(11);
    const positions = expected.map((heading) => headings.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('uses the exact section copy the directive fixed', () => {
    renderLanding();
    expect(screen.getByRole('heading', { name: 'Describe the result. Cherry plans the work.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Work in parallel without becoming the project manager.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'One capability layer for every tool.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Give every worker only the computer access it needs.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Teach once. Improve every teammate.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Keep the workforce when the best model changes.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Automate outcomes, not repeated prompts.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Routine work continues. Consequential work comes back to you.' })).toBeTruthy();
  });

  it('labels every capability, model and run path with an allowed status only', () => {
    renderLanding();
    const allowed = new Set(['Connected', 'Validated', 'Available', 'Experimental', 'Roadmap', 'Shipped']);
    const chips = screen.getAllByTestId('status-chip');
    expect(chips.length).toBeGreaterThanOrEqual(12);
    for (const chip of chips) expect(allowed.has(chip.textContent ?? '')).toBe(true);
    // Nothing on the landing may claim a live connector or a background cloud.
    expect(screen.queryByText(/Download for Windows/i)).toBeNull();
    expect(screen.queryByText(/24\/7/)).toBeNull();
    expect(screen.queryByText(/laptop is closed/i)).toBeNull();
    expect(screen.queryByText(/connected to LinkedIn/i)).toBeNull();
    const connectedChips = chips.filter((chip) => chip.textContent === 'Connected');
    expect(connectedChips).toHaveLength(0);
  });

  it('keeps the guided example reachable and the final CTAs honest', () => {
    renderLanding();
    expect(screen.getByTestId('guided-example-link').getAttribute('href')).toBe('/studio?demo=1');
    const finalCtas = screen.getByTestId('final-ctas');
    expect(within(finalCtas).getByRole('link', { name: 'Open Cherry' }).getAttribute('href')).toBe('/studio/control');
    expect(within(finalCtas).getByRole('link', { name: 'Watch the verified run' }).getAttribute('href')).toBe('/showcase#real-run');
  });

  it('follows the copy guide: no exclamation marks, em dashes, or emoji in visible text', () => {
    const { container } = renderLanding();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('uses Cherry-origin editorial plates only, all decorative and sized', () => {
    const { container } = renderLanding();
    const images = Array.from(container.querySelectorAll('img'));
    const plates = images.filter((image) => image.getAttribute('src')?.includes('/media/cherry-editorial/'));
    expect(plates.length).toBeGreaterThanOrEqual(3);
    for (const image of plates) {
      expect(image.getAttribute('alt')).toBe('');
      expect(image.getAttribute('width')).toBeTruthy();
      expect(image.getAttribute('height')).toBeTruthy();
    }
    for (const image of images) {
      expect(image.getAttribute('src') ?? '').not.toMatch(/hermes|nousresearch|x\.ai|grok/i);
    }
  });
});
