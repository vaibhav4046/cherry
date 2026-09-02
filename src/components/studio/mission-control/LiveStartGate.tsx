import { useEffect, useState } from 'react';
import { listRunnerHosts, runnerStatus } from '../../../cherry/runner-client/runner-api.ts';

const HOST_PROBE_MAX_AGE_MS = 60_000;
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
export function LiveStartGate({ canStart, policyAllows, requiredCapabilitySets, busy, onStart }: LiveStartGateProps) {
  const [liveReady, setLiveReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let probing = false;

    if (!canStart || !policyAllows) {
      setLiveReady(false);
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
        if (!status.reachable || !status.paired || cancelled) return;

        const probed = await listRunnerHosts();
        if (!probed.ok || cancelled) return;
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
        if (!cancelled) setLiveReady(hasEligibleHost);
      } catch {
        if (!cancelled) setLiveReady(false);
      } finally {
        probing = false;
      }
    }

    const refresh = () => {
      void probe();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const timer = window.setInterval(refresh, LIVE_READINESS_REFRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [canStart, policyAllows, requiredCapabilitySets]);

  if (!liveReady) return null;

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
