import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';

const NAV = [
  { to: '/studio', label: 'Command', end: true },
  { to: '/studio/skills', label: 'Skills', end: false },
  { to: '/studio/memory', label: 'Memory', end: false },
  { to: '/studio/runs', label: 'Runs', end: false },
  { to: '/studio/proof', label: 'Proof', end: false },
  { to: '/studio/settings/connections', label: 'Connect', end: false },
];

export function StudioLayout() {
  const { ready, activeWorkspace, activeMission, productState, webmcp } = useAppState();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ borderBottom: 'var(--border)' }}>
        <nav className="top-nav" aria-label="Studio navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <span className="label" style={{ marginRight: 'auto' }}>
            {activeWorkspace ? activeWorkspace.name : 'Cherry Studio'}
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
              {item.label}
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
