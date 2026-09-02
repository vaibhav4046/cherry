/**
 * Adapter registry for Runner v2, keyed by envelope.adapter.
 *
 * Every spawn is shell-free (argument arrays, shell:false) and all captured
 * output passes through the redaction helper. Provider CLI adapters record
 * exit codes and versions but their result status is only ever 'completed'
 * or 'failed' — NEVER 'verified': provider completion is not verification.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { redact } from './redact.mjs';
import { fetchYouTubeChannelFeed, validateYouTubeChannelId } from './youtube-rss-watch.mjs';
import { sourceWatchRoutineId } from './source-watch.mjs';
import { buildChildEnv, isPythonExecutable } from './process-policy.mjs';
import { buildTaskText, createAgentHosts, hostIdForKind } from './agent-hosts.mjs';
import { runChecks } from './checks.mjs';

const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_TIMEOUT_MS = 600_000;
const MAX_EXPORT_FILES = 2000;
const PROVIDER_NOTE = 'Provider CLI completion is not verification. Run cherry-verify afterwards.';
const CHECK_NOTE = 'Deterministic checks decide; a provider never verifies its own work.';
/** Agent hosts tried for a task with no host preference, in order. */
const DEFAULT_AGENT_HOST_IDS = ['codex', 'claude'];

/** Shell-free process runner with timeout + abort-signal support. */
export function runProcess(executable, argv, cwd, { timeoutMs = 120_000, signal, stdinText } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(executable, argv, {
      cwd,
      env: buildChildEnv(),
      shell: false,
      stdio: [stdinText === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
    const settle = (fn, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const kill = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
    };
    const timer = setTimeout(() => {
      kill();
      settle(rejectPromise, new Error(`timed out after ${timeoutMs}ms`));
    }, Math.min(timeoutMs, MAX_TIMEOUT_MS));
    const onAbort = () => {
      kill();
      settle(rejectPromise, new Error(`aborted: ${signal?.reason?.message ?? 'cancelled'}`));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
    });
    child.on('error', (error) => settle(rejectPromise, error));
    child.on('close', (code) => settle(resolvePromise, { exitCode: code ?? -1, stdout: redact(stdout), stderr: redact(stderr) }));
  });
}

/**
 * Build the registry. config: { allowedRoots: absolute paths, allowedExecutables: Set,
 * allowMockHost?, hosts? (an agent-hosts instance), hostCommands?, hostEndpoints?, searchPath? }.
 */
export function createAdapters(config) {
  const allowedRoots = config.allowedRoots.map((root) => resolve(root));
  const allowedExecutables = config.allowedExecutables;
  const hosts = config.hosts ?? createAgentHosts({
    commands: config.hostCommands ?? {},
    endpoints: config.hostEndpoints ?? {},
    allowMockHost: Boolean(config.allowMockHost),
    searchPath: config.searchPath,
  });

  function withinRoots(candidate) {
    const resolved = resolve(candidate);
    return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + sep));
  }

  function requireWorkingDirectory(envelope) {
    const dir = envelope.workingDirectory;
    if (!dir || !withinRoots(dir)) throw new Error('workingDirectory missing or outside approved roots');
    return resolve(dir);
  }

  /** Deterministic adapters take structured input as JSON in boundedPrompt. */
  function parsePayload(envelope) {
    try {
      const payload = JSON.parse(envelope.boundedPrompt);
      if (!payload || typeof payload !== 'object') throw new Error('not an object');
      return payload;
    } catch {
      throw new Error(`${envelope.adapter} requires boundedPrompt to be a JSON object payload`);
    }
  }

  function containedPath(base, relative) {
    const target = resolve(join(base, relative));
    if (target !== base && !target.startsWith(base + sep)) {
      throw new Error(`path escapes its directory: ${relative}`);
    }
    return target;
  }

  /** cherry-verify: run `node <workingDirectory>/verify.mjs`; exit 0 = completed. */
  async function cherryVerify(envelope, context) {
    const dir = requireWorkingDirectory(envelope);
    const script = join(dir, 'verify.mjs');
    if (!existsSync(script)) throw new Error('no verify.mjs in workingDirectory');
    const run = await runProcess(process.execPath, [script], dir, context);
    return { status: run.exitCode === 0 ? 'completed' : 'failed', ...run };
  }

  /** cherry-export: copy declared files into an output dir under allowed roots. */
  async function cherryExport(envelope) {
    const dir = requireWorkingDirectory(envelope);
    const payload = parsePayload(envelope);
    const files = Array.isArray(payload.files) ? payload.files.map(String) : [];
    if (files.length === 0) throw new Error('cherry-export requires a declared files list');
    if (typeof payload.outputDir !== 'string' || !withinRoots(payload.outputDir)) {
      throw new Error('outputDir missing or outside approved roots');
    }
    const outputDir = resolve(payload.outputDir);
    mkdirSync(outputDir, { recursive: true });
    const copied = [];
    for (const file of files.slice(0, MAX_EXPORT_FILES)) {
      const source = containedPath(dir, file);
      if (!existsSync(source)) throw new Error(`declared file missing: ${file}`);
      const target = containedPath(outputDir, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied.push(file);
    }
    return { status: 'completed', exitCode: 0, stdout: `Copied ${copied.length} files to ${outputDir}`, stderr: '', files: copied };
  }

  /** Provider CLIs spawn ONLY when allowed by BOTH the envelope and config. */
  async function providerCli(binary, envelope, context) {
    if (!Array.isArray(envelope.allowedExecutables) || !envelope.allowedExecutables.includes(binary)) {
      throw new Error(`${binary} is not allowed by the execution envelope`);
    }
    if (!allowedExecutables.has(binary)) {
      throw new Error(`${binary} is not in the runner config allowlist (start with --allow-exec ${binary})`);
    }
    const prompt = String(envelope.boundedPrompt ?? '').slice(0, 8000);
    if (!prompt) throw new Error('boundedPrompt is required');
    const cwd = requireWorkingDirectory(envelope);
    let providerVersion = null;
    try {
      const version = await runProcess(binary, ['--version'], cwd, { timeoutMs: 15_000 });
      providerVersion = redact((version.stdout || version.stderr).trim().slice(0, 200));
    } catch {
      providerVersion = null;
    }
    const cliArgv = binary === 'codex' ? ['exec', prompt] : ['-p', prompt];
    const run = await runProcess(binary, cliArgv, cwd, context);
    return {
      // NEVER 'verified' — verification only comes from cherry-verify.
      status: run.exitCode === 0 ? 'completed' : 'failed',
      ...run,
      providerVersion,
      providerNote: PROVIDER_NOTE,
    };
  }

  /** safe-command: exact argv; argv[0] must be config-allowlisted. */
  async function safeCommand(envelope, context) {
    const payload = parsePayload(envelope);
    const argv = Array.isArray(payload.argv) ? payload.argv.map(String) : [];
    if (argv.length === 0) throw new Error('safe-command requires an exact argv array');
    const [executable, ...rest] = argv;
    if (isPythonExecutable(executable)) {
      throw new Error('Python is reserved for the fixed Scrapling worker and cannot run through safe-command');
    }
    if (!allowedExecutables.has(executable)) {
      throw new Error(`executable "${executable}" is not in the runner config allowlist`);
    }
    const cwd = envelope.workingDirectory ? requireWorkingDirectory(envelope) : allowedRoots[0];
    const run = await runProcess(executable, rest, cwd, context);
    return { status: run.exitCode === 0 ? 'completed' : 'failed', ...run };
  }

  /** Optional ordinary-fetch Scrapling worker. Python and the fixed worker
   * path must both be explicitly configured; no arbitrary command is accepted. */
  async function scraplingFetch(envelope, context) {
    const payload = parsePayload(envelope);
    const executable = allowedExecutables.has('python') ? 'python' : allowedExecutables.has('python3') ? 'python3' : null;
    if (!executable) throw new Error('scrapling-fetch requires --allow-exec python (or python3)');
    const worker = join(allowedRoots[0], 'scraper', 'worker.py');
    if (!existsSync(worker)) throw new Error('scraper/worker.py is not installed under the approved root');
    const run = await runProcess(executable, [worker], allowedRoots[0], { ...context, stdinText: JSON.stringify(payload), timeoutMs: 30_000 });
    if (run.exitCode !== 0) return { status: 'failed', ...run, providerNote: 'Scrapling extraction is untrusted source material, not verification.' };
    return { status: 'completed', ...run, providerNote: 'Scrapling extraction is untrusted source material, not verification.' };
  }

  /** Fixed-host public YouTube channel RSS. This returns metadata-only entries;
   * no captions, descriptions, media, or transcript content is fetched. */
  async function youtubeRssWatch(envelope, context) {
    const payload = parsePayload(envelope);
    if (!validateYouTubeChannelId(payload.channelId)) {
      throw new Error('youtube-rss-watch requires an exact UC plus 22-character channelId');
    }
    if (typeof payload.sourceId !== 'string' || sourceWatchRoutineId(payload.sourceId) !== envelope.workItemId) {
      throw new Error('youtube-rss-watch sourceId does not match the execution envelope');
    }
    if (typeof payload.workspaceId !== 'string' || payload.workspaceId !== envelope.workspaceId) {
      throw new Error('youtube-rss-watch workspaceId does not match the execution envelope');
    }
    if (!/^[a-f0-9]{64}$/.test(payload.actionHash ?? '')) {
      throw new Error('youtube-rss-watch requires the approved watch actionHash');
    }
    const fetched = await fetchYouTubeChannelFeed(payload.channelId, {
      ...(config.youtubeRssOptions ?? {}),
      signal: context.signal,
      timeoutMs: Math.min(context.timeoutMs ?? 10_000, 10_000),
    });
    const feed = {
      schemaVersion: 1,
      watchId: payload.sourceId,
      actionHash: payload.actionHash,
      channelId: fetched.channelId,
      checkedAt: fetched.checkedAt,
      channelName: fetched.channelName,
      feedHash: fetched.feedHash,
      entries: fetched.entries,
    };
    return { status: 'completed', exitCode: 0, stdout: JSON.stringify(feed), stderr: '', feed };
  }

  /** Task for a host from the node payload; the mission executor may pass its own (repairs). */
  function hostTask(payload, context) {
    return context.task ?? {
      text: buildTaskText(payload),
      attempt: Number.isInteger(context.attempt) ? context.attempt : 1,
      contextText: typeof payload.contextText === 'string' ? payload.contextText : null,
      mock: payload.mock ?? null,
      nodeId: typeof payload.nodeId === 'string' ? payload.nodeId : null,
      outputs: Array.isArray(payload.outputs) ? payload.outputs.map(String) : [],
    };
  }

  /** agent-host: run the node task on the first usable host named by the
   *  payload hostKinds (codex-cli, claude-cli, local-runner = mock, manual).
   *  CLI hosts must be allowed by BOTH the envelope and the config, exactly
   *  like providerCli; the mock host needs --allow-mock-host. */
  async function agentHost(envelope, context) {
    const payload = parsePayload(envelope);
    const cwd = requireWorkingDirectory(envelope);
    const probes = await hosts.probe();
    const wanted = Array.isArray(payload.hostKinds) && payload.hostKinds.length > 0
      ? payload.hostKinds
      : (typeof envelope.executionHostId === 'string' && envelope.executionHostId !== 'any' ? [envelope.executionHostId] : null);
    const candidates = wanted
      ? [...new Set(wanted.map(hostIdForKind).filter(Boolean))]
      : [...DEFAULT_AGENT_HOST_IDS, ...(config.allowMockHost ? ['mock'] : [])];
    if (candidates.length === 0) throw new Error(`no agent host matches ${JSON.stringify(wanted)}`);
    const reasons = [];
    for (const hostId of candidates) {
      if (hostId === 'mock' && !config.allowMockHost) {
        reasons.push('the mock host is enabled only with --allow-mock-host');
        continue;
      }
      if (hostId !== 'mock' && hostId !== 'manual') {
        if (!Array.isArray(envelope.allowedExecutables) || !envelope.allowedExecutables.includes(hostId)) {
          reasons.push(`${hostId} is not allowed by the execution envelope`);
          continue;
        }
        if (!allowedExecutables.has(hostId)) {
          reasons.push(`${hostId} is not in the runner config allowlist (start with --allow-exec ${hostId})`);
          continue;
        }
        const probe = probes.find((candidate) => candidate.hostId === hostId);
        if (!probe?.available) {
          reasons.push(`${hostId}: ${probe?.details?.reason ?? 'unavailable'}`);
          continue;
        }
      }
      const result = await hosts.run(hostId, hostTask(payload, context), context.sandbox ?? { root: cwd }, context);
      // NEVER 'verified': the mission executor evaluates the sandbox afterwards.
      return { ...result, providerNote: PROVIDER_NOTE };
    }
    throw new Error(`no agent host is available for this task (${reasons.join('; ')})`);
  }

  /** cherry-check: run the envelope verificationPlan inside workingDirectory. */
  async function cherryCheck(envelope, context) {
    const cwd = requireWorkingDirectory(envelope);
    const report = await runChecks(envelope.verificationPlan, cwd, { allowedExecutables, timeoutMs: context.timeoutMs, signal: context.signal });
    const passed = report.status === 'passed';
    return { status: passed ? 'completed' : 'failed', exitCode: passed ? 0 : 1, stdout: JSON.stringify(report), stderr: '', report, providerNote: CHECK_NOTE };
  }

  /** mock-host: scripted host for tests; registered only with --allow-mock-host. */
  async function mockHost(envelope, context) {
    const payload = parsePayload(envelope);
    const cwd = requireWorkingDirectory(envelope);
    return hosts.run('mock', hostTask(payload, context), context.sandbox ?? { root: cwd }, context);
  }

  const missionAdapters = {
    'agent-host': agentHost,
    'cherry-check': cherryCheck,
    ...(config.allowMockHost ? { 'mock-host': mockHost } : {}),
  };

  const adapters = {
    'cherry-verify': cherryVerify,
    'cherry-export': cherryExport,
    'codex-cli': (envelope, context) => providerCli('codex', envelope, context),
    'claude-cli': (envelope, context) => providerCli('claude', envelope, context),
    'safe-command': safeCommand,
    'scrapling-fetch': scraplingFetch,
    'youtube-rss-watch': youtubeRssWatch,
  };

  const registry = { ...adapters, ...missionAdapters };

  return {
    /** General-purpose adapters exposed to /v2/jobs; mission adapters are listed separately. */
    names: Object.keys(adapters),
    missionAdapterNames: Object.keys(missionAdapters),
    hosts,
    has: (name) => Object.prototype.hasOwnProperty.call(registry, name),
    async run(envelope, context = {}) {
      const adapter = registry[envelope.adapter];
      if (!adapter) throw new Error(`unknown adapter ${envelope.adapter}`);
      return adapter(envelope, context);
    },
  };
}
