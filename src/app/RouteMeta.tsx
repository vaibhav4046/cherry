import { useEffect } from 'react';
import { matchRoutes, useLocation, type RouteObject } from 'react-router-dom';

export interface RouteMetadata {
  title: string;
  description: string;
}

const SITE = 'Cherry Wine';

function meta(title: string, description: string): RouteMetadata {
  return { title, description };
}

const STUDIO_META = meta(
  `Studio · ${SITE}`,
  'Turn what you know into skills your agents can install.',
);

const NOT_FOUND_META = meta(
  `Page not found · ${SITE}`,
  'That page does not exist.',
);

/** Metadata routes mirror App and inherit React Router's matching semantics. */
const META_ROUTES: RouteObject[] = [
  {
    path: '/',
    handle: meta(
      'Cherry · One task. An entire AI team.',
      'Cherry hands one goal to several agents at once, each in its own workspace on your computer, and checks what comes back. Codex execution is captured. Claude Code and local models are labelled experimental. Open source and local-first.',
    ),
  },
  {
    path: '/showcase',
    handle: meta(`Showcase · ${SITE}`, 'A recorded Codex run, replayed from a file checked against its hash, then the same lesson walkthrough by hand.'),
  },
  {
    path: '/connect',
    handle: meta(
      `Connect your agent · ${SITE}`,
      'Bring ChatGPT, Codex, Claude, or any MCP agent. Open standards, no API keys.',
    ),
  },
  {
    path: '/compatibility',
    handle: meta(`What's proven · ${SITE}`, 'Each capability, and the test that backs it.'),
  },
  {
    path: '/ingest',
    handle: meta(`Save to Cherry · ${SITE}`, 'Send a page or video straight into your source inbox.'),
  },
  {
    path: '/studio',
    handle: STUDIO_META,
    children: [
      { index: true, handle: STUDIO_META },
      {
        path: 'control',
        handle: meta(`Missions · ${SITE}`, 'Describe what you want. Cherry plans the tasks, runs them on your paired runner, and comes back when it needs a decision.'),
      },
      {
        path: 'control/:missionId',
        handle: meta(`Mission · ${SITE}`, 'The team, its workspaces, the checks that passed or failed, and what needs you.'),
      },
      {
        path: 'onboarding',
        handle: meta(`Start · ${SITE}`, 'Create your space and choose what Cherry should help your agents learn.'),
      },
      {
        path: 'quick',
        handle: meta(
          `Your first skill · ${SITE}`,
          'Paste a link or transcript and get an approved skill in about a minute.',
        ),
      },
      {
        path: 'sources',
        handle: meta(
          `Sources · ${SITE}`,
          'Save the material you want Cherry to learn from. Outside content stays untrusted until you review it.',
        ),
      },
      {
        path: 'creators',
        handle: meta(
          `Creators · ${SITE}`,
          'What is new from the creators you follow, and the skills Cherry proposes from it.',
        ),
      },
      {
        path: 'inbox',
        handle: meta(`Work inbox · ${SITE}`, 'Work items, who owns them, and every state change.'),
      },
      {
        path: 'work/:workItemId',
        handle: meta(`Work item · ${SITE}`, 'Review the work, its owner, and every recorded state change.'),
      },
      {
        path: 'crew',
        handle: meta(`Crew · ${SITE}`, 'Named agent seats and what each is allowed to do.'),
      },
      {
        path: 'routines',
        handle: meta(`Routines · ${SITE}`, 'Approve manual skill runs for your paired local runner, with timed schedules kept as drafts.'),
      },
      {
        path: 'routines/:routineId',
        handle: meta(
          `Routine · ${SITE}`,
          'Review the approved skill version, schedule, and run history for this routine.',
        ),
      },
      {
        path: 'missions/new',
        handle: meta(
          `New project · ${SITE}`,
          'Define what your agent should produce and the real checks it must pass.',
        ),
      },
      {
        path: 'missions/:missionId',
        handle: meta(`Project · ${SITE}`, 'See the source, files, checks, and proof for this project.'),
      },
      {
        path: 'watch/:lessonId',
        handle: meta(
          `Review source · ${SITE}`,
          'Add or review a transcript, mark what you checked, and keep every claim tied to its source.',
        ),
      },
      {
        path: 'memory',
        handle: meta(`Memory · ${SITE}`, 'What Cherry remembers, with where it came from.'),
      },
      {
        path: 'skills',
        handle: meta(
          `Skill Library · ${SITE}`,
          'Browse your skills, see which versions are approved, and install those that are ready.',
        ),
      },
      {
        path: 'skills/:skillId',
        handle: meta(
          `Skill · ${SITE}`,
          'Inspect the exact version, evidence, approval, and install options for this skill.',
        ),
      },
      {
        path: 'artifacts/:artifactSetId',
        handle: meta(`Files · ${SITE}`, 'Inspect and edit what your agent produced before you run its checks.'),
      },
      {
        path: 'runs',
        handle: meta(`Runs · ${SITE}`, 'See what ran, what passed, and what needs your attention.'),
      },
      {
        path: 'proof',
        handle: meta(`Proof · ${SITE}`, 'Receipts you can recompute. Change one byte and they fail.'),
      },
      {
        path: 'proof/:receiptId',
        handle: meta(`Proof · ${SITE}`, 'Receipts you can recompute. Change one byte and they fail.'),
      },
      {
        path: 'agent',
        handle: meta(`Agent view · ${SITE}`, 'Live WebMCP registrations and the tool call log.'),
      },
      {
        path: 'settings/connections',
        handle: meta(
          `Connections · ${SITE}`,
          'Pair your local runner, connect agents, or keep working entirely in this browser.',
        ),
      },
    ],
  },
  { path: '*', handle: NOT_FOUND_META },
];

function isRouteMetadata(value: unknown): value is RouteMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RouteMetadata>;
  return typeof candidate.title === 'string' && typeof candidate.description === 'string';
}

export function resolveRouteMeta(pathname: string): RouteMetadata {
  try {
    const matches = matchRoutes(META_ROUTES, pathname);
    const handle: unknown = matches?.at(-1)?.route.handle;
    return isRouteMetadata(handle) ? handle : NOT_FOUND_META;
  } catch {
    return NOT_FOUND_META;
  }
}

/** Frames to keep looking for a fragment target while the route finishes mounting. */
const FRAGMENT_SETTLE_FRAMES = 60;
/** Rechecks after the first scroll, for content that mounts late and moves the target. */
const FRAGMENT_REALIGN_DELAYS_MS = [200, 600, 1200];
/** How far the target may drift before it is worth scrolling again. */
const FRAGMENT_DRIFT_TOLERANCE_PX = 120;

/**
 * Keeps the browser tab and standard description aligned with the rendered route,
 * and takes a fragment link to its target. Client-side navigation renders the new
 * route after the URL changes, so the browser's own fragment scroll finds nothing:
 * without this, /showcase#recorded-mission lands at the top of the page and the
 * linked proof is thousands of pixels below the fold.
 */
export function RouteMeta() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const entry = resolveRouteMeta(pathname);
    document.title = entry.title;
    const description = document.querySelector('meta[name="description"]');
    if (description !== null) description.setAttribute('content', entry.description);
  }, [pathname]);

  useEffect(() => {
    const targetId = hash.startsWith('#') ? decodeURIComponent(hash.slice(1)) : '';
    if (targetId === '') return;

    let cancelled = false;
    let framesTried = 0;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scheduleNextAttempt = (attempt: () => void) => {
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(attempt);
      else window.setTimeout(attempt, 16);
    };

    const timers: number[] = [];
    const stop = () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.length = 0;
    };
    // The reader wins: once they move the page themselves, no further correction happens.
    const readerTookOver = () => stop();

    const align = (target: HTMLElement) => {
      if (cancelled) return;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    };

    const attempt = () => {
      if (cancelled) return;
      const target = document.getElementById(targetId);
      if (target === null) {
        // The section may still be mounting; look again for a bounded number of frames.
        framesTried += 1;
        if (framesTried <= FRAGMENT_SETTLE_FRAMES) scheduleNextAttempt(attempt);
        return;
      }
      align(target);
      // A keyboard visitor must continue from the target, not from the top of the document.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });

      // Content below a fragment can keep mounting after the first scroll and push the
      // target back down the page, so the alignment is rechecked a few times and only
      // corrected when it has actually drifted out of view.
      window.addEventListener('wheel', readerTookOver, { once: true, passive: true });
      window.addEventListener('touchstart', readerTookOver, { once: true, passive: true });
      window.addEventListener('keydown', readerTookOver, { once: true });
      for (const delay of FRAGMENT_REALIGN_DELAYS_MS) {
        timers.push(window.setTimeout(() => {
          if (cancelled) return;
          const settled = document.getElementById(targetId);
          if (settled === null) return;
          if (Math.abs(settled.getBoundingClientRect().top) > FRAGMENT_DRIFT_TOLERANCE_PX) align(settled);
        }, delay));
      }
    };

    scheduleNextAttempt(attempt);
    return () => {
      stop();
      window.removeEventListener('wheel', readerTookOver);
      window.removeEventListener('touchstart', readerTookOver);
      window.removeEventListener('keydown', readerTookOver);
    };
  }, [pathname, hash]);

  return null;
}
