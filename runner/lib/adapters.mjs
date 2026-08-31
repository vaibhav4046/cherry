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

const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_TIMEOUT_MS = 600_000;
const MAX_EXPORT_FILES = 2000;
const PROVIDER_NOTE = 'Provider CLI completion is not verification. Run cherry-verify afterwards.';

/** Shell-free process runner with timeout + abort-signal support. */
export function runProcess(executable, argv, cwd, { timeoutMs = 120_000, signal, stdinText } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(executable, argv, {
      cwd,
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
 * Build the registry. config: { allowedRoots: absolute paths, allowedExecutables: Set }.
 */
export function createAdapters(config) {
  const allowedRoots = config.allowedRoots.map((root) => resolve(root));
  const allowedExecutables = config.allowedExecutables;

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

  const adapters = {
    'cherry-verify': cherryVerify,
    'cherry-export': cherryExport,
    'codex-cli': (envelope, context) => providerCli('codex', envelope, context),
    'claude-cli': (envelope, context) => providerCli('claude', envelope, context),
    'safe-command': safeCommand,
    'scrapling-fetch': scraplingFetch,
  };

  return {
    names: Object.keys(adapters),
    has: (name) => Object.prototype.hasOwnProperty.call(adapters, name),
    async run(envelope, context = {}) {
      const adapter = adapters[envelope.adapter];
      if (!adapter) throw new Error(`unknown adapter ${envelope.adapter}`);
      return adapter(envelope, context);
    },
  };
}
