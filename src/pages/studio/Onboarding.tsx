import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { runnerStatus } from '../../cherry/runner-client/runner-api.ts';

interface CapabilityCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'checking';
  detail: string;
  fallback: string;
}

export default function Onboarding() {
  const { webmcp } = useAppState();
  const [checks, setChecks] = useState<CapabilityCheck[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: CapabilityCheck[] = [];

      results.push({
        name: 'WebMCP (document.modelContext)',
        status: webmcp.supported ? 'pass' : 'warn',
        detail: webmcp.supported
          ? 'A compatible client can register Cherry site tools on this page.'
          : 'This browser does not expose WebMCP.',
        fallback: 'Everything works manually. Open Cherry inside a compatible ChatGPT/Codex client to attach an agent.',
      });

      let storageDetail = 'IndexedDB is available.';
      let storageStatus: CapabilityCheck['status'] = 'pass';
      try {
        if (!('indexedDB' in globalThis)) throw new Error('missing');
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          const quotaMb = Math.round((estimate.quota ?? 0) / (1024 * 1024));
          storageDetail = `IndexedDB available · ~${quotaMb} MB quota.`;
        }
      } catch {
        storageStatus = 'fail';
        storageDetail = 'IndexedDB is not available.';
      }
      results.push({
        name: 'Local storage (IndexedDB)',
        status: storageStatus,
        detail: storageDetail,
        fallback: 'Without IndexedDB Cherry cannot persist. Use a normal (non-lockdown) browser profile.',
      });

      results.push({
        name: 'Service worker / PWA',
        status: 'serviceWorker' in navigator ? 'pass' : 'warn',
        detail: 'serviceWorker' in navigator ? 'Installable app shell supported.' : 'Service workers unavailable.',
        fallback: 'Cherry still runs as a normal web page; it just is not installable offline.',
      });

      results.push({
        name: 'YouTube embed',
        status: 'pass',
        detail: 'The official iframe player loads on demand when you open a lesson.',
        fallback: 'If YouTube is blocked on your network, use manual lessons with pasted transcripts.',
      });

      const runner = await runnerStatus();
      results.push({
        name: 'Local runner pairing',
        status: runner.reachable ? (runner.paired ? 'pass' : 'warn') : 'warn',
        detail: runner.reachable
          ? runner.paired
            ? 'Runner reachable and paired.'
            : 'Runner reachable on 127.0.0.1:47821 but not paired.'
          : 'No runner detected (optional).',
        fallback: 'The runner is optional. Start it with `node runner/dist/server.js` and pair from Connections.',
      });

      results.push({
        name: 'Reduced motion preference',
        status: 'pass',
        detail: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'Reduced motion requested — Cherry disables the marquee and transitions.'
          : 'No reduced-motion preference set.',
        fallback: 'Motion always respects your OS setting.',
      });

      if (!cancelled) setChecks(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [webmcp.supported]);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Capability check</h1>
      <p className="subhead">
        Current execution mode: <strong>{webmcp.supported ? 'Attached-capable' : 'Manual'}</strong>. Every
        failed check explains its impact and the manual fallback.
      </p>
      <div className="stack">
        {checks.length === 0 ? <p className="card">Running checks…</p> : null}
        {checks.map((check) => (
          <div key={check.name} className="card row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 'var(--sp-1)' }}>
              <strong>{check.name}</strong>
              <span>{check.detail}</span>
              {check.status !== 'pass' ? <span className="label">Fallback: {check.fallback}</span> : null}
            </div>
            <span className={check.status === 'pass' ? 'sticker sticker-pass' : check.status === 'fail' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>
              {check.status === 'pass' ? 'OK' : check.status === 'fail' ? 'Unavailable' : 'Optional'}
            </span>
          </div>
        ))}
      </div>
      <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Back to Command Center
      </Link>
    </div>
  );
}
