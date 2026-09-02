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
  'Teach, approve, verify, and ship skills to every agent you use.',
);

const NOT_FOUND_META = meta(
  `Page not found · ${SITE}`,
  'That page does not exist. The rest of Cherry does.',
);

/** Metadata routes mirror App and inherit React Router's matching semantics. */
const META_ROUTES: RouteObject[] = [
  {
    path: '/',
    handle: meta(
      'Cherry Wine · Turn lessons into skills every agent can run',
      'Teach a workflow once. Cherry turns it into an approved, verified skill and serves it to ChatGPT, Codex, Claude, and any agent you connect. Free, open source, no API key.',
    ),
  },
  {
    path: '/showcase',
    handle: meta(`Showcase · ${SITE}`, 'See a source become a proven skill, end to end, in one guided journey.'),
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
    handle: meta(`What's proven · ${SITE}`, 'Every capability labeled by the test that actually backs it.'),
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
        handle: meta(`Work inbox · ${SITE}`, 'Work items, owners, and honest state transitions.'),
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
        handle: meta(`Agent view · ${SITE}`, 'Live WebMCP registrations and the real tool call log.'),
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

/** Keeps the browser tab and standard description aligned with the rendered route. */
export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = resolveRouteMeta(pathname);
    document.title = entry.title;
    const description = document.querySelector('meta[name="description"]');
    if (description !== null) description.setAttribute('content', entry.description);
  }, [pathname]);

  return null;
}
