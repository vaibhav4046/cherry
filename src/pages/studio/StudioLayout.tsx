import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { CherryHomeLink } from '../../components/CherryHomeLink.tsx';
import { GuidedTour } from '../../components/GuidedTour.tsx';
import { Icons } from '../../components/Icons.tsx';
import type { ProductState } from '../../cherry/mission/mission-state.ts';

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  icon: (size: number) => ReactNode;
  title?: string;
  hint?: string;
}

const NAV_PRIMARY: NavItem[] = [
  { to: '/studio', label: 'Command', end: true, icon: Icons.command, title: 'Overview' },
  { to: '/studio/control', label: 'Team', end: false, icon: Icons.agent, title: 'Give Cherry an outcome and watch the team work' },
  { to: '/studio/quick', label: 'Quick skill', end: false, icon: Icons.quick, hint: 'add a source' },
  { to: '/studio/sources', label: 'Sources', end: false, icon: Icons.watch },
  { to: '/studio/creators', label: 'Creators', end: false, icon: Icons.pin },
  { to: '/studio/skills', label: 'Skills', end: false, icon: Icons.skills },
  { to: '/studio/runs', label: 'Runs', end: false, icon: Icons.runs },
  { to: '/studio/proof', label: 'Proof', end: false, icon: Icons.proof },
  { to: '/studio/settings/connections', label: 'Connect', end: false, icon: Icons.connect },
];

const NAV_WORKFORCE: NavItem[] = [
  { to: '/studio/inbox', label: 'Inbox', end: false, icon: Icons.runs },
  { to: '/studio/crew', label: 'Crew', end: false, icon: Icons.agent },
  { to: '/studio/routines', label: 'Routines', end: false, icon: Icons.memory },
  { to: '/studio/agent', label: 'Agent', end: false, icon: Icons.agent },
  { to: '/studio/memory', label: 'Memory', end: false, icon: Icons.memory },
];

const NAV_ALL: NavItem[] = [...NAV_PRIMARY, ...NAV_WORKFORCE];

const PRODUCT_STATE_LABEL: Record<ProductState, string> = {
  empty: 'No project yet',
  onboarding: 'Getting started',
  learning: 'Learning',
  planning: 'Shaping the skill',
  execution: 'Running',
  verification: 'Verifying',
  passed: 'Verified',
};

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end} className="rail-link" title={item.title}>
      {item.icon(18)}
      <span className="rail-link-text">
        {item.label}
        {item.hint ? <span className="rail-hint" aria-hidden="true">{item.hint}</span> : null}
      </span>
    </NavLink>
  );
}

export function StudioLayout() {
  const { ready, workspaces, activeWorkspace, activeMission, productState, webmcp, setActiveWorkspace, setToolSurface } = useAppState();
  const location = useLocation();
  const isOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // Route-driven tool surface: registered tools follow where the human is.
  useEffect(() => {
    const path = location.pathname;
    const surface =
      path.startsWith('/studio/control')
        ? ('control' as const)
      : path.startsWith('/studio/inbox') || path.startsWith('/studio/work')
        ? ('inbox' as const)
        : path.startsWith('/studio/crew')
          ? ('crew' as const)
          : path.startsWith('/studio/routines')
          ? ('routines' as const)
            : path.startsWith('/studio/runs')
            ? ('run' as const)
            : path.startsWith('/studio/sources') || path.startsWith('/studio/creators')
              ? ('sources' as const)
            : ('default' as const);
    setToolSurface(surface);
  }, [location.pathname, setToolSurface]);

  const stateLabel =
    productState === 'planning' && activeMission?.state === 'AWAITING_APPROVAL'
      ? 'Awaiting your approval'
      : PRODUCT_STATE_LABEL[productState];

  const hostPill = webmcp.supported
    ? {
        text: `Agent connected · ${webmcp.registered.length} tools`,
        className: 'sticker sticker-pass tnum',
        title: `An agent is connected. ${webmcp.registered.length} tools are available now.`,
      }
    : !isOnline
      ? {
          text: 'Offline',
          className: 'sticker sticker-wait',
          title: 'This device is offline. Cherry keeps working — everything lives in this browser.',
        }
      : {
          text: 'Manual mode',
          className: 'sticker',
          title:
            'No agent is connected in this browser. Everything works manually. Open Cherry in a compatible ChatGPT or Codex client to connect one.',
        };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ borderBottom: 'var(--border)' }}>
        <nav className="top-nav" aria-label="Studio navigation">
          <CherryHomeLink />
          <span className="label top-nav-context" style={{ marginRight: 'auto' }}>
            {workspaces.length > 1 ? (
              <select
                className="select workspace-select"
                aria-label="Space"
                value={activeWorkspace?.id ?? ''}
                onChange={(event) => setActiveWorkspace(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            ) : (
              activeWorkspace ? activeWorkspace.name : 'Cherry Wine Studio'
            )}
            {activeMission ? ` · ${activeMission.title}` : ''}
          </span>
          <span className="sticker" data-testid="product-state" title={`Product state: ${productState}`}>
            {stateLabel}
          </span>
          <span className={hostPill.className} data-testid="webmcp-status" title={hostPill.title}>
            {hostPill.text}
          </span>
        </nav>
      </header>

      <div className="studio-shell">
        <nav className="studio-rail" aria-label="Studio sections">
          <div className="rail-group">
            {NAV_PRIMARY.map((item) => (
              <RailLink key={item.to} item={item} />
            ))}
          </div>
          <div className="rail-divider">Workforce</div>
          <div className="rail-group">
            {NAV_WORKFORCE.map((item) => (
              <RailLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
        <main className="studio-main" id="studio-main">
          {ready ? <Outlet /> : (
            <div className="empty-state" role="status" aria-live="polite">
              <span className="sticker sticker-cherry">Opening your space…</span>
            </div>
          )}
        </main>
      </div>

      <GuidedTour />

      <nav className="bottom-nav" aria-label="Studio sections (mobile)">
        {NAV_ALL.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
