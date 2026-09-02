import { useEffect, useState } from 'react';
import { listRunnerHosts, runnerStatus } from '../../../cherry/runner-client/runner-api.ts';

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

    if (!canStart || !policyAllows) {
      setLiveReady(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setLiveReady(false);
      const status = await runnerStatus();
      if (!status.reachable || !status.paired || cancelled) return;

      const probed = await listRunnerHosts();
      if (!probed.ok || cancelled) return;
      const eligibleHosts = probed.value.hosts.filter((host) =>
        host.status === 'shipped_tested'
        && host.available
        && host.authenticated !== false
        && Boolean(host.checkedAt),
      );
      const hasEligibleHost = eligibleHosts.length > 0 && requiredCapabilitySets.every((required) =>
        eligibleHosts.some((host) => required.every((capability) => host.capabilities.includes(capability))),
      );
      if (!cancelled) setLiveReady(hasEligibleHost);
    })();

    return () => {
      cancelled = true;
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
