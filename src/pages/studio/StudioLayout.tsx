import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { GuidedTour } from '../../components/GuidedTour.tsx';
import { Icons } from '../../components/Icons.tsx';

const NAV = [
  { to: '/studio', label: 'Command', end: true, icon: Icons.command },
  { to: '/studio/inbox', label: 'Inbox', end: false, icon: Icons.runs },
  { to: '/studio/crew', label: 'Crew', end: false, icon: Icons.agent },
  { to: '/studio/quick', label: 'Quick skill', end: false, icon: Icons.quick },
  { to: '/studio/agent', label: 'Agent', end: false, icon: Icons.agent },
  { to: '/studio/skills', label: 'Skills', end: false, icon: Icons.skills },
  { to: '/studio/memory', label: 'Memory', end: false, icon: Icons.memory },
  { to: '/studio/runs', label: 'Runs', end: false, icon: Icons.runs },
  { to: '/studio/proof', label: 'Proof', end: false, icon: Icons.proof },
  { to: '/studio/settings/connections', label: 'Connect', end: false, icon: Icons.connect },
];

export function StudioLayout() {
  const { ready, activeWorkspace, activeMission, productState, webmcp } = useAppState();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ borderBottom: 'var(--border)' }}>
        <nav className="top-nav" aria-label="Studio navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <span className="label" style={{ marginRight: 'auto' }}>
            {activeWorkspace ? activeWorkspace.name : 'Cherry Wine Studio'}
            {activeMission ? ` · ${activeMission.title}` : ''}
          </span>
          <span className="sticker" data-testid="product-state">State: {productState}</span>
          <span
            className={webmcp.supported ? 'sticker sticker-pass' : 'sticker sticker-wait'}
            data-testid="webmcp-status"
            title={
              webmcp.supported
                ? `WebMCP active: ${webmcp.registered.length} tools registered`
                : 'WebMCP is not available in this browser. Everything works manually; open Cherry in a compatible ChatGPT/Codex client to attach an agent.'
            }
          >
            {webmcp.supported ? `WebMCP · ${webmcp.registered.length} tools` : 'WebMCP off · manual mode'}
          </span>
        </nav>
      </header>

      <div className="studio-shell">
        <nav className="studio-rail" aria-label="Studio sections">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="rail-link">
              {item.icon(18)} {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="studio-main" id="studio-main">
          {ready ? <Outlet /> : (
            <div className="empty-state" role="status" aria-live="polite">
              <span className="sticker sticker-cherry">Opening your workspace…</span>
            </div>
          )}
        </main>
      </div>

      <GuidedTour />

      <nav className="bottom-nav" aria-label="Studio sections (mobile)">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
