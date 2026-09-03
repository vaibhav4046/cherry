import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRunnerHosts, runnerStatus } from '../../../cherry/runner-client/runner-api.ts';

// The runner caches host probes for 60 s, so a fresh answer can already be a minute old; two minutes is the staleness line.
const HOST_PROBE_MAX_AGE_MS = 120_000;
const LIVE_READINESS_REFRESH_MS = 15_000;

interface LiveStartGateProps {
  canStart: boolean;
  policyAllows: boolean;
  requiredCapabilitySets: readonly (readonly string[])[];
  busy: boolean;
  onStart: () => void;
}

/**
 * Keeps the live runner affordance fail-closed. The mission service remains the
 * authority at click time; this gate only decides whether a truthful action can
 * be offered before then.
 */
type Blocker = 'runner' | 'host' | null;

const BLOCKER_COPY: Record<Exclude<Blocker, null>, string> = {
  runner: 'This plan is ready. Doing the work needs your own computer, because Cherry runs the agents you already pay for rather than a model of its own: pair a computer under Connect and a Start button appears here.',
  host: 'Your computer is paired, but no agent is signed in on it. Sign in to Codex there and a Start button appears here.',
};

export function LiveStartGate({ canStart, policyAllows, requiredCapabilitySets, busy, onStart }: LiveStartGateProps) {
  const [liveReady, setLiveReady] = useState(false);
  const [blocker, setBlocker] = useState<Blocker>(null);

  useEffect(() => {
    let cancelled = false;
    let probing = false;
    // Set once the probe has established there is no runner to talk to. A visitor
    // without a paired computer must not generate a failed loopback request every
    // 15 seconds for as long as the tab is open; the page recovers on focus instead.
    let stopPolling = false;
    let timer = 0;

    if (!canStart || !policyAllows) {
      setLiveReady(false);
      setBlocker(null);
      return () => {
        cancelled = true;
      };
    }

    async function probe() {
      if (cancelled || probing) return;
      probing = true;
      setLiveReady(false);
      try {
        const status = await runnerStatus();
        if (cancelled) return;
        if (!status.reachable || !status.paired) {
          setBlocker('runner');
          stopPolling = true;
          return;
        }

        const probed = await listRunnerHosts();
        if (cancelled) return;
        if (!probed.ok) {
          setBlocker('host');
          return;
        }
        const now = Date.now();
        const eligibleHosts = probed.value.hosts.filter((host) => {
          const checkedAt = host.checkedAt ? Date.parse(host.checkedAt) : Number.NaN;
          const age = now - checkedAt;
          return host.status === 'shipped_tested'
            && host.available
            && host.authenticated !== false
            && Number.isFinite(checkedAt)
            && age >= 0
            && age < HOST_PROBE_MAX_AGE_MS;
        });
        const hasEligibleHost = eligibleHosts.length > 0 && requiredCapabilitySets.every((required) =>
          eligibleHosts.some((host) => required.every((capability) => host.capabilities.includes(capability))),
        );
        if (!cancelled) {
          setLiveReady(hasEligibleHost);
          setBlocker(hasEligibleHost ? null : 'host');
        }
      } catch {
        if (!cancelled) {
          setLiveReady(false);
          setBlocker('runner');
          stopPolling = true;
        }
      } finally {
        probing = false;
        if (stopPolling && timer !== 0) {
          window.clearInterval(timer);
          timer = 0;
        }
      }
    }

    // Focus and visibility changes are user actions, so they may re-probe even
    // after the timer has stopped: someone can start a runner and come back.
    const refresh = () => {
      stopPolling = false;
      void probe();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    void probe();
    timer = window.setInterval(() => { void probe(); }, LIVE_READINESS_REFRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [canStart, policyAllows, requiredCapabilitySets]);

  if (!liveReady) {
    // Say why there is nothing to press, and offer the one thing that does work here,
    // instead of leaving a visitor without a paired computer at a dead end.
    if (blocker === null) return null;
    return (
      <p className="label" style={{ textTransform: 'none', letterSpacing: 0, margin: 0, maxWidth: '64ch' }} data-testid="live-start-blocker">
        {BLOCKER_COPY[blocker]}{' '}
        <Link to="/showcase#recorded-mission">Watch a real run that already happened</Link>, recorded with two agents working at once.
      </p>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={onStart}
      data-testid="start-mission"
    >
      Start on the paired runner
    </button>
  );
}
