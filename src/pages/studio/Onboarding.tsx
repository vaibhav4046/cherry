import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { runnerStatus } from '../../cherry/runner-client/runner-api.ts';

interface CapabilityCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'checking';
  detail: string;
  fallback: string;
  badge?: string;
}

export default function Onboarding() {
  const { webmcp } = useAppState();
  const [checks, setChecks] = useState<CapabilityCheck[]>([]);
  const agentConnected = webmcp.agent?.attached ?? false;
  const siteToolsExposed = webmcp.supported && !agentConnected;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: CapabilityCheck[] = [];

      results.push({
        name: 'Agent connection',
        status: agentConnected ? 'pass' : 'warn',
        detail: agentConnected
          ? 'Connected. Your agent can use the Cherry tools available on this page.'
          : siteToolsExposed
            ? 'This browser exposes site tools. Ask your agent to use one and this turns Connected.'
            : 'Not connected. You can keep using Cherry yourself.',
        fallback: 'Open Cherry inside a compatible ChatGPT or Codex browser when you want an agent to use it.',
        badge: agentConnected ? 'Connected' : 'Not connected',
      });

      let storageDetail = 'Your Cherry data can be saved in this browser.';
      let storageStatus: CapabilityCheck['status'] = 'pass';
      try {
        if (!('indexedDB' in globalThis)) throw new Error('missing');
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          const quotaMb = Math.round((estimate.quota ?? 0) / (1024 * 1024));
          storageDetail = `Your Cherry data can be saved here · about ${quotaMb} MB available.`;
        }
      } catch {
        storageStatus = 'fail';
        storageDetail = 'This browser cannot save Cherry data.';
      }
      results.push({
        name: 'Saved in this browser',
        status: storageStatus,
        detail: storageDetail,
        fallback: 'Use a standard browser profile that allows sites to save data.',
      });

      results.push({
        name: 'Offline access',
        status: 'serviceWorker' in navigator ? 'pass' : 'warn',
        detail: 'serviceWorker' in navigator
          ? 'This browser can keep Cherry available when you are offline.'
          : 'This browser cannot install Cherry for offline use.',
        fallback: 'Cherry still works while this page is open and online.',
      });

      results.push({
        name: 'YouTube playback',
        status: 'pass',
        detail: 'The official YouTube player opens only when you choose a saved video.',
        fallback: 'If YouTube is blocked on your network, paste a transcript into a saved source.',
      });

      const runner = await runnerStatus();
      results.push({
        name: 'Local runner',
        status: runner.reachable ? (runner.paired ? 'pass' : 'warn') : 'warn',
        detail: runner.reachable
          ? runner.paired
            ? 'Connected and ready for work you choose to run on your computer.'
            : 'Found on this computer, but not paired.'
          : 'Not connected. The local runner is optional.',
        fallback: 'Open Connections to start or pair the local runner.',
        badge: runner.paired ? 'Connected' : 'Not connected',
      });

      results.push({
        name: 'Motion setting',
        status: 'pass',
        detail: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'Cherry will reduce movement to match your device setting.'
          : 'Cherry will use its standard, restrained movement.',
        fallback: 'Cherry follows your device setting.',
      });

      if (!cancelled) setChecks(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentConnected]);

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Setup check</h1>
      <p className="subhead">
        Agent connection: <strong>{agentConnected ? 'Connected' : 'Not connected'}</strong>. These checks
        show what works in this browser and what to do when something is unavailable.
      </p>
      <div className="stack">
        {checks.length === 0 ? <p className="card">Checking this browser.</p> : null}
        {checks.map((check) => (
          <div key={check.name} className="card row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 'var(--sp-1)' }}>
              <strong>{check.name}</strong>
              <span>{check.detail}</span>
              {check.status !== 'pass' ? <span className="label">What to do: {check.fallback}</span> : null}
            </div>
            <span className={check.status === 'pass' ? 'sticker sticker-pass' : check.status === 'fail' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>
              {check.badge ?? (check.status === 'pass' ? 'Ready' : check.status === 'fail' ? 'Unavailable' : 'Optional')}
            </span>
          </div>
        ))}
      </div>
      <Link to="/studio" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
        Open Command Center
      </Link>
    </div>
  );
}
