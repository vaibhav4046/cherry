/**
 * Deterministic VerificationCheckSpec runner.
 *
 * Kinds: command (argv[0] is 'node', mapped to the current executable, or a
 * runner-allowlisted executable), file (exists), file_contains, hash (sha256
 * of a file), human (always 'blocked': a person has to look). Paths are
 * contained in the sandbox root. Refusals (path escape, executable not
 * allowlisted, unknown kind) are recorded as failed checks, never thrown.
 *
 * Report status: any required check that is not 'passed' makes the report
 * 'failed', except when the only non-passing required checks are 'blocked',
 * which yields 'blocked'. Blocked never counts as passed.
 */
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute, normalize, resolve, sep } from 'node:path';
import { redact } from './redact.mjs';
import { isPythonExecutable } from './process-policy.mjs';
import { runCaptured } from './agent-hosts.mjs';
import { createPhysicalPathGuard } from './physical-path-guard.mjs';

const CHECK_KINDS = new Set(['command', 'file', 'file_contains', 'hash', 'human']);
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_DETAIL_CHARS = 2000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function parseCheckSpec(spec) {
  if (typeof spec === 'string') {
    try {
      const parsed = JSON.parse(spec);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return spec && typeof spec === 'object' ? spec : null;
}

function readContained(guard, root, relative) {
  const target = guard.inside(root, relative, { mustExist: true, type: 'file' });
  const stats = statSync(target);
  if (!stats.isFile()) throw new Error(`${relative} is not a file`);
  if (stats.size > MAX_FILE_BYTES) throw new Error(`${relative} is larger than ${MAX_FILE_BYTES} bytes`);
  return guard.readInside(root, relative);
}

function tail(text) {
  const clean = redact(text ?? '').trim();
  return clean.length > MAX_DETAIL_CHARS ? clean.slice(-MAX_DETAIL_CHARS) : clean;
}

function executableAuthorized(allowed, executable, command) {
  return allowed.has(executable) || allowed.has(command);
}

/** Node checks intentionally support only its data-only test runner surface. */
function safeNodeTestArgv(argv) {
  if (argv[0] !== '--test') return false;
  return argv.slice(1).every((argument) => {
    if (typeof argument !== 'string' || argument.length === 0 || argument.startsWith('-') || isAbsolute(argument)) return false;
    const normalized = normalize(argument);
    if (normalized === '..' || normalized.startsWith(`..${sep}`)) return false;
    return !normalized.split(/[\\/]/).includes('..');
  });
}

async function runCommandCheck(spec, root, { allowedExecutables, authorizedExecutables, timeoutMs, signal, guard }) {
  const argv = Array.isArray(spec.argv) ? spec.argv.map(String) : [];
  if (argv.length === 0) return { status: 'failed', detail: 'command checks need a non-empty argv', evidenceRefs: [] };
  const [executable, ...rest] = argv;
  let command = executable;
  if (executable === 'node') {
    command = process.execPath;
    if (!executableAuthorized(allowedExecutables, executable, command)) {
      return { status: 'failed', detail: 'node is not allowlisted in the runner config for command checks', evidenceRefs: [] };
    }
    if (!executableAuthorized(authorizedExecutables, executable, command)) {
      return { status: 'failed', detail: 'node is not authorized by the execution envelope and approved plan', evidenceRefs: [] };
    }
    if (!safeNodeTestArgv(rest)) {
      return { status: 'failed', detail: 'refusing Node command check: only data-only "node --test [relative-workspace-target ...]" is allowed', evidenceRefs: [] };
    }
    for (const relative of rest.slice(1)) guard.inside(root, relative, { mustExist: true });
  } else if (isPythonExecutable(executable)) {
    return { status: 'failed', detail: 'Python is reserved for the fixed Scrapling worker and is not allowlisted for checks', evidenceRefs: [] };
  } else if (!allowedExecutables.has(executable)) {
    return { status: 'failed', detail: `executable "${executable}" is not allowlisted for checks (start the runner with --allow-exec ${executable})`, evidenceRefs: [] };
  } else if (!authorizedExecutables.has(executable)) {
    return { status: 'failed', detail: `executable "${executable}" is not authorized by the execution envelope and approved plan`, evidenceRefs: [] };
  } else {
    return { status: 'failed', detail: `refusing command check executable "${executable}": no data-only grammar is defined`, evidenceRefs: [] };
  }
  const expected = Number.isInteger(spec.expectExitCode) ? spec.expectExitCode : 0;
  const run = await runCaptured(command, rest, { cwd: root, timeoutMs, signal });
  const evidenceRefs = [`command:${argv.join(' ')}`, `exit:${run.exitCode}`];
  if (run.timedOut) return { status: 'failed', detail: `timed out after ${timeoutMs}ms`, evidenceRefs };
  if (run.aborted) return { status: 'not_run', detail: 'cancelled before the command finished', evidenceRefs };
  if (run.spawnError) return { status: 'failed', detail: `could not start: ${run.spawnError}`, evidenceRefs };
  const detail = `exit ${run.exitCode} (expected ${expected})${run.stderr ? `; stderr: ${tail(run.stderr)}` : ''}`;
  return { status: run.exitCode === expected ? 'passed' : 'failed', detail, evidenceRefs };
}

function runFileCheck(spec, root, guard) {
  const target = guard.inside(root, spec.path, { mustExist: true, type: 'file' });
  const evidenceRefs = [`file:${spec.path}`];
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return { status: 'failed', detail: `file not found: ${spec.path}`, evidenceRefs };
  }
  if (!stats.isFile()) return { status: 'failed', detail: `${spec.path} is not a file`, evidenceRefs };
  return { status: 'passed', detail: `file exists (${stats.size} bytes)`, evidenceRefs };
}

function runContainsCheck(spec, root, guard) {
  if (typeof spec.contains !== 'string' || spec.contains.length === 0) {
    return { status: 'failed', detail: 'file_contains checks need a non-empty contains string', evidenceRefs: [] };
  }
  const text = readContained(guard, root, spec.path).toString('utf8');
  const found = text.includes(spec.contains);
  return { status: found ? 'passed' : 'failed', detail: found ? 'expected text found' : 'expected text not found', evidenceRefs: [`file:${spec.path}`] };
}

function runHashCheck(spec, root, guard) {
  const expected = String(spec.expectedSha256 ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return { status: 'failed', detail: 'hash checks need a 64 character expectedSha256', evidenceRefs: [] };
  const actual = createHash('sha256').update(readContained(guard, root, spec.path)).digest('hex');
  return {
    status: actual === expected ? 'passed' : 'failed',
    detail: actual === expected ? 'sha256 matches' : `sha256 mismatch: got ${actual}`,
    evidenceRefs: [`file:${spec.path}`, `sha256:${actual}`],
  };
}

async function runOne(spec, root, options) {
  if (!CHECK_KINDS.has(spec.kind)) return { status: 'failed', detail: `unknown check kind: ${String(spec.kind)}`, evidenceRefs: [] };
  if (spec.kind === 'human') return { status: 'blocked', detail: 'requires a person', evidenceRefs: [] };
  try {
    if (spec.kind === 'command') return await runCommandCheck(spec, root, options);
    if (spec.kind === 'file') return runFileCheck(spec, root, options.guard);
    if (spec.kind === 'file_contains') return runContainsCheck(spec, root, options.guard);
    return runHashCheck(spec, root, options.guard);
  } catch (error) {
    return { status: 'failed', detail: redact(String(error?.message ?? error)), evidenceRefs: [] };
  }
}

/** Summarise EvaluationCheck records: required not passed -> failed; required blocked only -> blocked. */
export function summariseChecks(checks, requiredIds) {
  const required = new Set(requiredIds);
  let blocked = false;
  for (const check of checks) {
    if (!required.has(check.id)) continue;
    if (check.status === 'blocked') blocked = true;
    else if (check.status !== 'passed') return 'failed';
  }
  for (const id of required) {
    if (!checks.some((check) => check.id === id)) return 'failed';
  }
  return blocked ? 'blocked' : 'passed';
}

/**
 * Run every spec in order inside sandboxRoot. Returns an evaluation report
 * { status, checks, requiredIds, startedAt, finishedAt, sandboxRoot }.
 */
export async function runChecks(specs, sandboxRoot, { allowedExecutables = new Set(), authorizedExecutables = new Set(), timeoutMs = DEFAULT_TIMEOUT_MS, signal, now = () => Date.now() } = {}) {
  const root = resolve(sandboxRoot);
  const guard = createPhysicalPathGuard([root]);
  const startedAt = new Date(now()).toISOString();
  const checks = [];
  const requiredIds = [];
  const list = Array.isArray(specs) ? specs : [];
  for (let index = 0; index < list.length; index += 1) {
    const spec = parseCheckSpec(list[index]);
    if (!spec) {
      checks.push({ id: `check-${index + 1}`, name: 'unparseable check', status: 'failed', evidenceRefs: [], detail: 'the check spec is not a JSON object' });
      requiredIds.push(`check-${index + 1}`);
      continue;
    }
    const id = typeof spec.id === 'string' && spec.id.length > 0 ? spec.id : `check-${index + 1}`;
    const name = typeof spec.description === 'string' && spec.description.length > 0 ? spec.description : id;
    if (spec.required !== false) requiredIds.push(id);
    if (signal?.aborted) {
      checks.push({ id, name, status: 'not_run', evidenceRefs: [], detail: 'cancelled before this check ran' });
      continue;
    }
    const outcome = await runOne(spec, root, { allowedExecutables, authorizedExecutables, timeoutMs, signal, guard });
    checks.push({ id, name, ...outcome });
  }
  return { status: summariseChecks(checks, requiredIds), checks, requiredIds, startedAt, finishedAt: new Date(now()).toISOString(), sandboxRoot: root };
}
