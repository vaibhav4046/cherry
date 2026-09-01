import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface RouteEntry {
  matches: (path: string) => boolean;
  title: string;
  description: string;
}

const SITE = 'Cherry Wine';

/** Most specific first; the last entry catches unknown paths (the 404 view). */
const ROUTE_META: RouteEntry[] = [
  {
    matches: (path) => path === '/',
    title: 'Cherry Wine · Turn lessons into skills every agent can run',
    description:
      'Teach a workflow once. Cherry turns it into an approved, verified skill and serves it to ChatGPT, Codex, Claude, and any agent you connect. Free, open source, no API key.',
  },
  {
    matches: (path) => path.startsWith('/showcase'),
    title: `Showcase · ${SITE}`,
    description: 'Watch a lesson become a proven skill, end to end, in one guided journey.',
  },
  {
    matches: (path) => path.startsWith('/connect'),
    title: `Connect your agent · ${SITE}`,
    description: 'Bring ChatGPT, Codex, Claude, or any MCP agent. Open standards, no API keys.',
  },
  {
    matches: (path) => path.startsWith('/compatibility'),
    title: `What's proven · ${SITE}`,
    description: 'Every capability labeled by the test that actually backs it.',
  },
  {
    matches: (path) => path.startsWith('/ingest'),
    title: `Save to Cherry · ${SITE}`,
    description: 'Send a page or video straight into your source inbox.',
  },
  {
    matches: (path) => path.startsWith('/studio/skills'),
    title: `Skill Library · ${SITE}`,
    description: 'Every skill Cherry has learned, ready to install into your agents.',
  },
  {
    matches: (path) => path.startsWith('/studio/sources'),
    title: `Sources · ${SITE}`,
    description: 'Save the material you want Cherry to learn from. Outside content stays untrusted until you review it.',
  },
  {
    matches: (path) => path.startsWith('/studio/quick'),
    title: `Your first skill · ${SITE}`,
    description: 'Paste a link or transcript and get an approved skill in about a minute.',
  },
  {
    matches: (path) => path.startsWith('/studio/routines'),
    title: `Routines · ${SITE}`,
    description: 'Run approved skills on a schedule through your paired local runner.',
  },
  {
    matches: (path) => path.startsWith('/studio/memory'),
    title: `Memory · ${SITE}`,
    description: 'What Cherry remembers, with where it came from.',
  },
  {
    matches: (path) => path.startsWith('/studio/inbox') || path.startsWith('/studio/work'),
    title: `Work inbox · ${SITE}`,
    description: 'Work items, owners, and honest state transitions.',
  },
  {
    matches: (path) => path.startsWith('/studio/crew'),
    title: `Crew · ${SITE}`,
    description: 'Named agent seats and what each is allowed to do.',
  },
  {
    matches: (path) => path.startsWith('/studio/agent'),
    title: `Agent view · ${SITE}`,
    description: 'Live WebMCP registrations and the real tool call log.',
  },
  {
    matches: (path) => path.startsWith('/studio/proof'),
    title: `Proof · ${SITE}`,
    description: 'Receipts you can recompute. Change one byte and they fail.',
  },
  {
    matches: (path) => path.startsWith('/studio'),
    title: `Studio · ${SITE}`,
    description: 'Teach, approve, verify, and ship skills to every agent you use.',
  },
  {
    matches: (path) => path.startsWith('/lab/'),
    title: `Brand lab · ${SITE}`,
    description: 'Cherry Wine 3D brand objects.',
  },
  {
    matches: () => true,
    title: `Page not found · ${SITE}`,
    description: 'That page does not exist. The rest of Cherry does.',
  },
];

/**
 * Per-route document titles and meta descriptions. One component at the router
 * root instead of scattered effects, so every route gets a unique, honest
 * title (and search engines and tab bars stop seeing one identical string).
 */
export function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = ROUTE_META.find((candidate) => candidate.matches(pathname)) ?? ROUTE_META[ROUTE_META.length - 1]!;
    document.title = entry.title;
    const description = document.querySelector('meta[name="description"]');
    if (description !== null) description.setAttribute('content', entry.description);
  }, [pathname]);

  return null;
}
