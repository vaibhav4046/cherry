/**
 * Agent hosts: descriptors, probes, and task execution for the Plane C hosts
 * (codex, claude, mock, manual; kilo, kimi, ollama, omniroute and
 * openai-compatible are probe only).
 *
 * Every spawn is an argv array with shell:false, a minimal child env, a
 * 256 KiB output cap, redaction, a timeout and AbortSignal cancellation.
 * Host argv is built only from flags observed in the probe; no danger flag is
 * ever passed. A host result is 'completed' or 'failed' (the manual host
 * returns 'needs_human'); it is never 'verified': provider completion is not
 * verification.
 */
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { buildChildEnv } from './process-policy.mjs';
import { redact } from './redact.mjs';
import { createPhysicalPathGuard } from './physical-path-guard.mjs';

export const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_TIMEOUT_MS = 1_800_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 15_000;
const ENDPOINT_PROBE_TIMEOUT_MS = 5_000;
const INLINE_TASK_LIMIT = 6_000;
const PROVIDER_NOTE = 'Provider completion is not verification.';
const TASK_POINTER_PROMPT = 'Read .cherry/TASK.md and follow it. Context, if any, is in .cherry/CONTEXT.md.';

export const DANGER_FLAGS = [
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  'danger-full-access',
  '--full-auto',
  '--yolo',
];

const CODEX_FLAGS = ['--sandbox', '-C', '--cd', '--skip-git-repo-check', '--output-last-message', '--json'];
const CLAUDE_FLAGS = ['-p', '--output-format', '--permission-mode', '--add-dir', '--max-turns'];
const CLI_CAPABILITIES = ['repository_read', 'repository_write', 'command_execution', 'artifact_write'];

export const HOST_DESCRIPTORS = [
  { hostId: 'codex', kind: 'codex-cli', executable: 'codex', probe: 'cli', helpArgv: ['exec', '--help'], flags: CODEX_FLAGS, requiredFlags: ['--sandbox'], modes: ['exec'], boundary: 'process', capabilities: CLI_CAPABILITIES, runnable: true, foundStatus: 'shipped_tested' },
  { hostId: 'claude', kind: 'claude-cli', executable: 'claude', probe: 'cli', helpArgv: ['--help'], flags: CLAUDE_FLAGS, modes: ['print'], boundary: 'unknown', capabilities: CLI_CAPABILITIES, runnable: false, detectionOnly: true, foundStatus: 'experimental' },
  { hostId: 'kilo', kind: 'kilo-cli', executable: 'kilo', probe: 'cli', helpArgv: null, flags: [], modes: [], boundary: 'process', capabilities: [], runnable: false, foundStatus: 'experimental' },
  { hostId: 'kimi', kind: 'kimi-cli', executable: 'kimi', probe: 'cli', helpArgv: null, flags: [], modes: [], boundary: 'process', capabilities: [], runnable: false, foundStatus: 'experimental' },
  { hostId: 'ollama', kind: 'ollama', executable: null, probe: 'http', path: '/api/tags', modes: [], boundary: 'unknown', capabilities: [], runnable: false, foundStatus: 'experimental' },
  { hostId: 'omniroute', kind: 'omniroute', executable: null, probe: 'http', path: '/v1/models', modes: [], boundary: 'unknown', capabilities: [], runnable: false, foundStatus: 'experimental' },
  { hostId: 'openai-compatible', kind: 'openai-compatible', executable: null, probe: 'http', path: '/v1/models', modes: [], boundary: 'unknown', capabilities: [], runnable: false, foundStatus: 'experimental' },
  { hostId: 'mock', kind: 'mock', executable: null, probe: 'mock', modes: ['script'], boundary: 'process', capabilities: CLI_CAPABILITIES, runnable: true, foundStatus: 'shipped_tested' },
  { hostId: 'manual', kind: 'manual', executable: null, probe: 'manual', modes: ['handoff'], boundary: 'unknown', capabilities: CLI_CAPABILITIES, runnable: true, foundStatus: 'shipped_tested' },
];

const descriptorFor = (hostId) => HOST_DESCRIPTORS.find((descriptor) => descriptor.hostId === hostId) ?? null;

/** Browser ExecutionHostKind values mapped to runner host ids. */
export const HOST_KIND_TO_ID = Object.freeze({ 'codex-cli': 'codex', 'claude-cli': 'claude', 'local-runner': 'mock', manual: 'manual' });

/** Host id for a browser host kind or a runner host id; null when unknown. */
export function hostIdForKind(kind) {
  if (typeof kind !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(HOST_KIND_TO_ID, kind)) return HOST_KIND_TO_ID[kind];
  return descriptorFor(kind) ? kind : null;
}

export function hostKindOf(hostId) {
  return descriptorFor(hostId)?.kind ?? null;
}

// ---------------- process discipline ----------------

/**
 * Spawn `command` (a string, or an array of executable plus fixed leading
 * args) with `argv`. Never rejects: the result carries exitCode (null when
 * killed or not started), capped and redacted output, and the reason flags.
 */
export function runCaptured(command, argv = [], { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const [executable, ...fixed] = Array.isArray(command) ? command : [command];
  const startedAt = Date.now();
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let settled = false;
    let child = null;
    const state = { timedOut: false, aborted: false, spawnError: null };
    const kill = () => {
      try {
        child?.kill('SIGKILL');
      } catch {
        /* already dead */
      }
    };
    const timer = setTimeout(() => {
      state.timedOut = true;
      kill();
    }, Math.min(Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS));
    const onAbort = () => {
      state.aborted = true;
      kill();
    };
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolvePromise({ exitCode, stdout: redact(stdout), stderr: redact(stderr), truncated, wallClockMs: Date.now() - startedAt, ...state });
    };
    const append = (current, chunk) => {
      if (current.length >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString();
      if (next.length <= MAX_OUTPUT_BYTES) return next;
      truncated = true;
      return next.slice(0, MAX_OUTPUT_BYTES);
    };
    try {
      child = spawn(executable, [...fixed, ...argv], {
        cwd,
        env: buildChildEnv(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      state.spawnError = String(error?.message ?? error);
      finish(null);
      return;
    }
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => {
      state.spawnError = String(error?.message ?? error);
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

function sleep(ms, signal) {
  return new Promise((resolvePromise) => {
    if (signal?.aborted) return resolvePromise('aborted');
    const onAbort = () => {
      clearTimeout(timer);
      resolvePromise('aborted');
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolvePromise('done');
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    return undefined;
  });
}

// ---------------- probes ----------------

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A documented flag counts as present when the help text lists it as a flag token. */
export function helpListsFlag(helpText, flag) {
  return new RegExp(`(^|[\\s,\\[|])${escapeRegExp(flag)}(?=[\\s,=<\\]|]|$)`, 'm').test(String(helpText));
}

function firstLine(text) {
  return redact(String(text ?? '')).split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 200) ?? null;
}

function probeRecord(descriptor, now, patch) {
  return {
    hostId: descriptor.hostId,
    kind: descriptor.kind,
    executable: descriptor.executable,
    available: false,
    authenticated: null,
    version: null,
    modes: descriptor.modes,
    capabilities: descriptor.capabilities,
    boundary: descriptor.boundary,
    checkedAt: new Date(now()).toISOString(),
    details: {},
    status: 'unavailable',
    ...patch,
  };
}

async function probeCli(descriptor, command, now, timeoutMs) {
  const version = await runCaptured(command, ['--version'], { timeoutMs });
  const executable = Array.isArray(command) ? command.join(' ') : command;
  if (version.spawnError) {
    return probeRecord(descriptor, now, { executable, details: { reason: `${executable} not found on PATH or not executable (${version.spawnError})` } });
  }
  if (version.timedOut) return probeRecord(descriptor, now, { executable, details: { reason: 'the version probe timed out' } });
  if (version.exitCode !== 0) {
    return probeRecord(descriptor, now, { executable, details: { reason: `the version probe exited with code ${version.exitCode}: ${firstLine(version.stderr || version.stdout) ?? ''}`.trim() } });
  }
  const details = {};
  if (descriptor.helpArgv) {
    const help = await runCaptured(command, descriptor.helpArgv, { timeoutMs });
    const helpText = help.exitCode === 0 ? `${help.stdout}\n${help.stderr}` : '';
    details.helpProbe = descriptor.helpArgv.join(' ');
    if (help.exitCode !== 0) details.helpReason = help.spawnError ?? `help probe exited with code ${help.exitCode}`;
    details.flags = Object.fromEntries(descriptor.flags.map((flag) => [flag, helpListsFlag(helpText, flag)]));
  }
  const missingRequired = (descriptor.requiredFlags ?? []).filter((flag) => !details.flags?.[flag]);
  if (missingRequired.length > 0) {
    details.reason = `required containment flag not observed: ${missingRequired.join(', ')}; Codex needs --sandbox workspace-write`;
    return probeRecord(descriptor, now, { executable, available: false, version: firstLine(version.stdout || version.stderr), details, status: 'experimental' });
  }
  if (descriptor.detectionOnly) {
    details.reason = 'detected for information only; no equivalent automatic containment boundary is enforced, so use a manual handoff';
    return probeRecord(descriptor, now, { executable, available: false, version: firstLine(version.stdout || version.stderr), details, status: descriptor.foundStatus });
  }
  return probeRecord(descriptor, now, {
    executable,
    available: true,
    version: firstLine(version.stdout || version.stderr),
    details,
    status: descriptor.foundStatus,
  });
}

async function probeEndpoint(descriptor, endpoint, now, timeoutMs) {
  if (typeof endpoint !== 'string' || !/^https?:\/\//.test(endpoint)) {
    return probeRecord(descriptor, now, { details: { reason: `no endpoint configured for ${descriptor.hostId} (use --host-command ${descriptor.hostId}=<url>)` } });
  }
  let url;
  try {
    url = new URL(descriptor.path, endpoint).toString();
  } catch {
    return probeRecord(descriptor, now, { details: { endpoint, reason: 'the configured endpoint is not a valid URL' } });
  }
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.min(timeoutMs, ENDPOINT_PROBE_TIMEOUT_MS)) });
    if (!response.ok) return probeRecord(descriptor, now, { details: { endpoint, reason: `${url} answered ${response.status}` } });
    return probeRecord(descriptor, now, { available: true, details: { endpoint }, status: descriptor.foundStatus });
  } catch (error) {
    return probeRecord(descriptor, now, { details: { endpoint, reason: redact(`${url} is not reachable: ${String(error?.message ?? error)}`) } });
  }
}

/** Probe one host. config: { command, endpoint, allowMockHost, now, timeoutMs }. */
export async function probeHost(descriptor, { command = null, endpoint = null, allowMockHost = false, now = () => Date.now(), timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  if (descriptor.probe === 'manual') return probeRecord(descriptor, now, { available: true, status: descriptor.foundStatus, details: { note: 'a person does the work; the runner records the handoff' } });
  if (descriptor.probe === 'mock') {
    return allowMockHost
      ? probeRecord(descriptor, now, { available: true, status: descriptor.foundStatus, details: { note: 'scripted host for tests' } })
      : probeRecord(descriptor, now, { details: { reason: 'the mock host is enabled only with --allow-mock-host' } });
  }
  if (descriptor.probe === 'http') return probeEndpoint(descriptor, endpoint, now, timeoutMs);
  if (!command) return probeRecord(descriptor, now, { details: { reason: `no command configured for ${descriptor.hostId} (use --host-command ${descriptor.hostId}=<path>)` } });
  return probeCli(descriptor, command, now, timeoutMs);
}

/**
 * Probe every descriptor. config: { commands: { hostId: string | string[] },
 * endpoints: { hostId: url }, allowMockHost, searchPath (default true: CLI
 * hosts without a configured command are looked up on PATH by name), now }.
 */
export async function probeHosts(config = {}) {
  const commandFor = (descriptor) => {
    if (config.commands && Object.prototype.hasOwnProperty.call(config.commands, descriptor.hostId)) return config.commands[descriptor.hostId];
    return config.searchPath === false ? null : descriptor.executable;
  };
  return Promise.all(
    HOST_DESCRIPTORS.map((descriptor) =>
      probeHost(descriptor, {
        command: commandFor(descriptor),
        endpoint: config.endpoints?.[descriptor.hostId] ?? null,
        allowMockHost: Boolean(config.allowMockHost),
        now: config.now,
        timeoutMs: config.timeoutMs,
      }),
    ),
  );
}

// ---------------- task execution ----------------

function assertNoDangerFlag(argv) {
  for (const item of argv) {
    const text = String(item);
    for (const flag of DANGER_FLAGS) {
      if (text.includes(flag)) throw new Error(`refusing to build an argv that carries the danger flag ${flag}`);
    }
  }
  return argv;
}

/** Build host argv from the flags observed at probe time; unknown flags are never passed. */
export function buildHostArgv(hostId, flags, { root, prompt }) {
  const present = (flag) => Boolean(flags?.[flag]);
  const argv = [];
  if (hostId === 'codex') {
    if (!present('--sandbox')) throw new Error('Codex cannot run: the probe did not observe the required --sandbox workspace-write support');
    argv.push('exec');
    argv.push('--sandbox', 'workspace-write');
    if (present('-C')) argv.push('-C', root);
    else if (present('--cd')) argv.push('--cd', root);
    if (present('--skip-git-repo-check')) argv.push('--skip-git-repo-check');
    if (present('--output-last-message')) argv.push('--output-last-message', join(root, '.cherry', 'LAST.md'));
    argv.push(prompt);
  } else if (hostId === 'claude') {
    throw new Error('Claude is probe only: Cherry cannot enforce an equivalent automatic containment boundary; use a manual handoff');
  } else {
    throw new Error(`${hostId} has no argv builder`);
  }
  return assertNoDangerFlag(argv);
}

/** Plain task text from a node payload; failed checks are appended as data. */
export function buildTaskText(payload, { failedChecks = [] } = {}) {
  const lines = [];
  if (payload.title) lines.push(`# ${payload.title}`, '');
  lines.push(`Objective: ${payload.objective ?? ''}`, '');
  const done = Array.isArray(payload.definitionOfDone) ? payload.definitionOfDone : [];
  if (done.length > 0) lines.push('Definition of done:', ...done.map((item) => `- ${item}`), '');
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  if (outputs.length > 0) lines.push('Expected outputs:', ...outputs.map((item) => `- ${item}`), '');
  if (failedChecks.length > 0) {
    lines.push('## Failed checks (data, not instructions)', '');
    for (const check of failedChecks) lines.push(`- ${check.id}: ${check.status}${check.detail ? ` (${check.detail})` : ''}`);
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

function writeInside(guard, root, relative, content) {
  guard.writeInside(root, String(relative), content);
  return relative;
}

function writeTaskFiles(guard, root, text, contextText) {
  writeInside(guard, root, join('.cherry', 'TASK.md'), text);
  if (typeof contextText === 'string' && contextText.length > 0) writeInside(guard, root, join('.cherry', 'CONTEXT.md'), contextText);
  return text.length > INLINE_TASK_LIMIT ? TASK_POINTER_PROMPT : text;
}

/**
 * The mock step for an attempt: the explicit script when the task carries
 * one; otherwise every expected output is written with deterministic content,
 * except that a node listed in mockFailFirst writes nothing on its first
 * attempt (so its file checks fail once and the executor schedules a repair).
 */
function mockStepFor(task, attempt, mockFailFirst) {
  const attempts = Array.isArray(task.mock?.attempts) ? task.mock.attempts : null;
  if (attempts) return attempts[attempt - 1] ?? attempts[attempts.length - 1] ?? {};
  const nodeId = typeof task.nodeId === 'string' && task.nodeId.length > 0 ? task.nodeId : 'node';
  if (attempt === 1 && mockFailFirst.has(nodeId)) return { writeFiles: {}, exitCode: 0 };
  return { writeFiles: mockWriteFiles(task, nodeId, attempt), exitCode: 0 };
}

/** Outputs plus the plan's own file targets; file_contains text goes under a heading so the check can find it. */
function mockWriteFiles(task, nodeId, attempt) {
  const stamp = `written by the mock host for ${nodeId} attempt ${attempt}\n`;
  const files = {};
  for (const relative of Array.isArray(task.outputs) ? task.outputs.map(String) : []) files[relative] = stamp;
  for (const target of Array.isArray(task.fileTargets) ? task.fileTargets : []) {
    if (typeof target?.path !== 'string' || target.path.length === 0) continue;
    const base = files[target.path] ?? stamp;
    files[target.path] = typeof target.contains === 'string' && target.contains.length > 0 && !base.includes(target.contains)
      ? `${base}\n${target.contains}\n\nMock content for ${nodeId}.\n`
      : base;
  }
  return files;
}

async function runMockScript(task, root, attempt, { signal, timeoutMs, mockFailFirst = new Set(), mockDelayMs = 0, guard }) {
  const step = mockStepFor(task, attempt, mockFailFirst);
  const files = Object.entries(step.writeFiles ?? {});
  for (const [relative] of files) guard.inside(root, relative);
  const wrote = files.map(([relative, content]) => writeInside(guard, root, relative, String(content)));
  const sleepMs = Number.isFinite(step.sleepMs) ? Math.max(0, step.sleepMs) : Math.max(0, Number(mockDelayMs) || 0);
  const bounded = Math.min(sleepMs, timeoutMs);
  const slept = bounded > 0 ? await sleep(bounded, signal) : 'done';
  const exitCode = Number.isInteger(step.exitCode) ? step.exitCode : 0;
  return {
    exitCode,
    stdout: JSON.stringify({ mock: true, attempt, wrote }),
    stderr: '',
    truncated: false,
    timedOut: sleepMs > timeoutMs && slept === 'done',
    aborted: slept === 'aborted',
    spawnError: null,
  };
}

function artifactPath(guard, root, attempt, stream, content) {
  const relative = join('.cherry', `attempt-${attempt}.${stream}.txt`);
  writeInside(guard, root, relative, content);
  return relative;
}

/**
 * Run one task on a host inside the sandbox. task: { text, attempt, contextText, mock }.
 * context: { command, probe, signal, timeoutMs, allowMockHost, now }.
 */
export async function runHostTask(hostId, task, sandbox, context = {}) {
  const now = context.now ?? (() => Date.now());
  const startedAt = now();
  const timeoutMs = Math.min(Math.max(1, Number(context.timeoutMs) || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const base = {
    hostId,
    status: 'failed',
    exitCode: null,
    providerVersion: null,
    wallClockMs: 0,
    stdout: '',
    stderr: '',
    stdoutArtifact: null,
    stderrArtifact: null,
    argv: [],
    reason: null,
    timedOut: false,
    aborted: false,
    note: PROVIDER_NOTE,
  };
  const fail = (reason) => ({ ...base, reason, wallClockMs: now() - startedAt });
  const descriptor = descriptorFor(hostId);
  if (!descriptor) return fail(`unknown host ${hostId}`);
  if (typeof sandbox?.root !== 'string' || sandbox.root.length === 0) return fail('a sandbox root is required');
  const root = resolve(sandbox.root);
  let guard;
  try {
    guard = createPhysicalPathGuard([root]);
  } catch (error) {
    return fail(`unsafe sandbox path: ${String(error?.message ?? error)}`);
  }
  const text = String(task?.text ?? '');
  if (text.trim().length === 0) return fail('task text is required');
  const attempt = Number.isInteger(task?.attempt) && task.attempt > 0 ? task.attempt : 1;

  let prompt;
  try {
    prompt = writeTaskFiles(guard, root, text, task?.contextText);
  } catch (error) {
    return fail(`could not write the task files: ${String(error?.message ?? error)}`);
  }

  if (hostId === 'manual') {
    const handoff = [
      '# Handoff for a person',
      '',
      `Attempt ${attempt}. Cherry did not run this task on an automated host. Do the work described below, then record the outcome in Mission Control.`,
      '',
      '## Task',
      '',
      text,
    ].join('\n');
    writeInside(guard, root, join('.cherry', 'HANDOFF.md'), handoff);
    return { ...base, status: 'needs_human', reason: 'a person has to do this task; see .cherry/HANDOFF.md', wallClockMs: now() - startedAt };
  }

  let run;
  let providerVersion = null;
  let argv = [];
  if (hostId === 'mock') {
    if (!context.allowMockHost) return fail('the mock host is not enabled (start the runner with --allow-mock-host)');
    try {
      run = await runMockScript(task ?? {}, root, attempt, { signal: context.signal, timeoutMs, mockFailFirst: new Set(context.mockFailFirst ?? []), mockDelayMs: context.mockDelayMs ?? 0, guard });
    } catch (error) {
      return fail(String(error?.message ?? error));
    }
    providerVersion = 'mock';
  } else {
    if (!descriptor.runnable) return fail(`${hostId} is probe only; it cannot run tasks yet`);
    const command = context.command ?? descriptor.executable;
    const probe = context.probe ?? (await probeHost(descriptor, { command, now }));
    if (!probe.available) return fail(`host ${hostId} is unavailable: ${probe.details?.reason ?? 'unknown reason'}`);
    providerVersion = probe.version;
    try {
      argv = buildHostArgv(hostId, probe.details?.flags ?? {}, { root, prompt });
    } catch (error) {
      return fail(String(error?.message ?? error));
    }
    run = await runCaptured(command, argv, { cwd: root, timeoutMs, signal: context.signal });
  }

  const stdoutArtifact = artifactPath(guard, root, attempt, 'stdout', run.stdout);
  const stderrArtifact = artifactPath(guard, root, attempt, 'stderr', run.stderr);
  let reason = null;
  if (run.timedOut) reason = `timed out after ${timeoutMs}ms`;
  else if (run.aborted) reason = `aborted: ${context.signal?.reason?.message ?? 'cancelled'}`;
  else if (run.spawnError) reason = `could not start the host: ${run.spawnError}`;
  else if (run.exitCode !== 0) reason = `exited with code ${run.exitCode}`;
  return {
    ...base,
    status: reason === null ? 'completed' : 'failed',
    exitCode: run.exitCode,
    providerVersion,
    wallClockMs: now() - startedAt,
    stdout: run.stdout,
    stderr: run.stderr,
    truncated: Boolean(run.truncated),
    stdoutArtifact,
    stderrArtifact,
    argv,
    reason,
    timedOut: Boolean(run.timedOut),
    aborted: Boolean(run.aborted),
  };
}

/**
 * A configured host set with a cached probe (60 s by default).
 * config: { commands, endpoints, allowMockHost, mockFailFirst, searchPath, probeTtlMs, now }.
 */
export function createAgentHosts(config = {}) {
  const now = config.now ?? (() => Date.now());
  const probeTtlMs = config.probeTtlMs ?? 60_000;
  let cache = null;
  const commandFor = (hostId) => {
    if (config.commands && Object.prototype.hasOwnProperty.call(config.commands, hostId)) return config.commands[hostId];
    return config.searchPath === false ? null : descriptorFor(hostId)?.executable ?? null;
  };
  return {
    config,
    commandFor,
    async probe({ force = false } = {}) {
      if (!force && cache && now() - cache.at < probeTtlMs) return cache.probes;
      if (!force && cache?.pending) return cache.pending;
      const pending = probeHosts({ ...config, now }).then((probes) => {
        cache = { at: now(), probes, pending: null };
        return probes;
      });
      cache = { at: cache?.at ?? 0, probes: cache?.probes ?? null, pending };
      return pending;
    },
    probedAt() {
      return cache?.at ? new Date(cache.at).toISOString() : null;
    },
    async run(hostId, task, sandbox, context = {}) {
      const probes = await this.probe();
      return runHostTask(hostId, task, sandbox, {
        ...context,
        command: context.command ?? commandFor(hostId),
        probe: context.probe ?? probes.find((probe) => probe.hostId === hostId) ?? null,
        allowMockHost: Boolean(config.allowMockHost),
        mockFailFirst: Array.isArray(config.mockFailFirst) ? config.mockFailFirst : [],
        mockDelayMs: Math.max(0, Number(config.mockDelayMs) || 0),
        now,
      });
    },
  };
}
