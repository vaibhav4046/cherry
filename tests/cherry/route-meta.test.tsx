import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteMeta, resolveRouteMeta } from '../../src/app/RouteMeta.tsx';

describe('route metadata', () => {
  it.each([
    ['/', 'Cherry · One task. An entire AI team.'],
    ['/showcase', 'Showcase · Cherry Wine'],
    ['/connect', 'Connect your agent · Cherry Wine'],
    ['/Connect', 'Connect your agent · Cherry Wine'],
    ['/connec%74', 'Connect your agent · Cherry Wine'],
    ['/compatibility', "What's proven · Cherry Wine"],
    ['/ingest', 'Save to Cherry · Cherry Wine'],
    ['/studio', 'Studio · Cherry Wine'],
    ['/studio/onboarding', 'Start · Cherry Wine'],
    ['/studio/quick', 'Your first skill · Cherry Wine'],
    ['/studio/sources', 'Sources · Cherry Wine'],
    ['/STUDIO/SOURCES', 'Sources · Cherry Wine'],
    ['/studio/%73ources', 'Sources · Cherry Wine'],
    ['/studio/inbox', 'Work inbox · Cherry Wine'],
    ['/studio/work/work-1', 'Work item · Cherry Wine'],
    ['/studio/crew', 'Crew · Cherry Wine'],
    ['/studio/routines', 'Routines · Cherry Wine'],
    ['/studio/routines/routine-1', 'Routine · Cherry Wine'],
    ['/studio/missions/new', 'New project · Cherry Wine'],
    ['/studio/missions/mission-1', 'Project · Cherry Wine'],
    ['/studio/control', 'Missions · Cherry Wine'],
    ['/studio/control/mission-1', 'Mission · Cherry Wine'],
    ['/studio/watch/source-1', 'Review source · Cherry Wine'],
    ['/studio/memory', 'Memory · Cherry Wine'],
    ['/studio/skills', 'Skill Library · Cherry Wine'],
    ['/studio/skills/skill-1', 'Skill · Cherry Wine'],
    ['/studio/skills/a%2Fb', 'Skill · Cherry Wine'],
    ['/studio/artifacts/files-1', 'Files · Cherry Wine'],
    ['/studio/runs', 'Runs · Cherry Wine'],
    ['/studio/proof', 'Proof · Cherry Wine'],
    ['/studio/proof/proof-1', 'Proof · Cherry Wine'],
    ['/studio/agent', 'Agent view · Cherry Wine'],
    ['/studio/settings/connections', 'Connections · Cherry Wine'],
  ])('resolves %s', (path, title) => {
    expect(resolveRouteMeta(path).title).toBe(title);
  });

  it('accepts one trailing slash on an exact route', () => {
    expect(resolveRouteMeta('/connect/').title).toBe('Connect your agent · Cherry Wine');
  });

  it('describes approval-gated skill installs honestly', () => {
    expect(resolveRouteMeta('/studio/skills').description).toBe(
      'Browse your skills, see which versions are approved, and install those that are ready.',
    );
  });

  it('describes files without inventing an artifact approval', () => {
    expect(resolveRouteMeta('/studio/artifacts/files-1').description).toBe(
      'Inspect and edit what your agent produced before you run its checks.',
    );
  });

  it('describes source review before or after a transcript exists', () => {
    expect(resolveRouteMeta('/studio/watch/source-1').description).toBe(
      'Add or review a transcript, mark what you checked, and keep every claim tied to its source.',
    );
  });

  it.each([
    '/connectivity',
    '/showcase-bogus',
    '/compatibility-check',
    '/ingestion',
    '/studioish',
    '/studio/sources-extra',
    '/studio/not-a-route',
    '/studio/work/one/two',
    '/lab/cherry-3d',
  ])('uses 404 metadata for %s', (path) => {
    expect(resolveRouteMeta(path)).toEqual({
      title: 'Page not found · Cherry Wine',
      description: 'That page does not exist. The rest of Cherry does.',
    });
  });

  it('fails closed on a malformed encoded path', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(resolveRouteMeta('/%E0%A4%A')).toEqual({
        title: 'Page not found · Cherry Wine',
        description: 'That page does not exist. The rest of Cherry does.',
      });
    } finally {
      warning.mockRestore();
    }
  });
});

describe('fragment navigation', () => {
  function renderAt(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <RouteMeta />
        <div style={{ height: 4000 }} />
        <section id="recorded-mission">The recorded mission</section>
      </MemoryRouter>,
    );
  }

  // jsdom implements no layout, so scrollIntoView is absent until a test provides it.
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('takes a fragment link to its target and leaves focus there', async () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoView);
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(focus);

    renderAt('/showcase#recorded-mission');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

    expect(scrollIntoView.mock.calls[0]![0]).toMatchObject({ block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // A keyboard visitor continues from the target, so it must be focusable.
    expect(document.getElementById('recorded-mission')!.getAttribute('tabindex')).toBe('-1');
  });

  it('does nothing without a fragment', async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoView);

    renderAt('/showcase');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('gives up quietly when the fragment names nothing on the page', async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scrollIntoView);

    renderAt('/showcase#no-such-section');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
