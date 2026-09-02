/**
 * Probe the fixed Scrapling worker once without touching the network.
 * Readiness means the worker itself imported its pinned runtime successfully;
 * an allowlisted executable and a file on disk are only configuration.
 */
export async function probeScraplingRuntime({ executable, worker, root, workerExists, runProcess }) {
  if (!executable || !workerExists) {
    return {
      configured: false,
      ready: false,
      status: 'not_configured',
      reason: !executable ? 'Python is not allowlisted' : 'scraper/worker.py is not installed under the approved root',
    };
  }

  try {
    const result = await runProcess(executable, [worker, '--self-check'], root, 5_000);
    let report;
    try {
      report = JSON.parse(result.stdout || '{}');
    } catch {
      return { configured: true, ready: false, status: 'check_failed', reason: 'Scrapling self-check returned invalid output' };
    }
    if (result.exitCode !== 0 || report?.ready !== true) {
      return {
        configured: true,
        ready: false,
        status: 'setup_required',
        reason: typeof report?.reason === 'string' ? report.reason : 'Scrapling self-check did not pass',
        ...(report?.versions && typeof report.versions === 'object' ? { versions: report.versions } : {}),
      };
    }
    return {
      configured: true,
      ready: true,
      status: 'ready',
      ...(report.versions && typeof report.versions === 'object' ? { versions: report.versions } : {}),
    };
  } catch {
    return { configured: true, ready: false, status: 'check_failed', reason: 'Scrapling self-check could not run' };
  }
}
