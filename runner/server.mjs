#!/usr/bin/env node
/**
 * Cherry Local Runner — localhost-only deterministic job runner.
 *
 * Security model:
 *  - binds 127.0.0.1 only, never 0.0.0.0;
 *  - a random one-time pairing token is printed at startup and required on
 *    every request (x-cherry-pair header);
 *  - exact-origin CORS: only the origin passed via --allow-origin (default
 *    http://127.0.0.1:4173 and http://127.0.0.1:5273) may call it;
 *  - working directories are restricted to roots passed via --root;
 *  - processes spawn with an argument array and shell:false;
 *  - one job runs at a time; output and duration are capped;
 *  - jobs persist atomically to runner-jobs.json and resume after restart;
 *  - environment variables are never dumped into logs or results.
 */
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, sep, isAbsolute } from 'node:path';
import { redact } from './lib/redact.mjs';
import { computeActionHash } from './lib/canonical.mjs';
import { EventsLog } from './lib/events.mjs';
import { DurableQueue, validateEnvelope } from './lib/queue.mjs';
import { Scheduler, validateRoutine } from './lib/scheduler.mjs';
import { createAdapters } from './lib/adapters.mjs';

const VERSION = '1.0.0';
const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

const args = process.argv.slice(2);
function argValues(flag) {
  const values = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === flag) values.push(args[index + 1]);
  }
  return values;
}

const allowedOrigins = new Set(
  argValues('--allow-origin').length > 0
    ? argValues('--allow-origin')
    : ['http://127.0.0.1:4173', 'http://127.0.0.1:5273', 'http://localhost:4173', 'http://localhost:5273'],
);
const allowedRoots = (argValues('--root').length > 0 ? argValues('--root') : [process.cwd()]).map((root) => resolve(root));
const allowedExecutables = new Set(argValues('--allow-exec'));
const stateDir = resolve(argValues('--state')[0] ?? join(process.cwd(), '.cherry-runner'));
mkdirSync(stateDir, { recursive: true });
const jobsFile = join(stateDir, 'runner-jobs.json');
const PORT = Number(argValues('--port')[0] ?? 47821);
/** Runner v2 durable data lives next to the existing state by default. */
const dataDir = resolve(argValues('--data-dir')[0] ?? join(stateDir, 'v2'));

const pairToken = process.env.CHERRY_RUNNER_TOKEN ?? randomBytes(24).toString('base64url');

function loadJobs() {
  try {
    return JSON.parse(readFileSync(jobsFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  const temporary = `${jobsFile}.tmp`;
  writeFileSync(temporary, JSON.stringify(jobs, null, 2));
  renameSync(temporary, jobsFile);
}

let jobs = loadJobs();
// Jobs that were running when the process died resume as queued.
for (const job of jobs) {
  if (job.status === 'running') job.status = 'queued';
}
saveJobs(jobs);

function withinRoots(candidate) {
  const resolved = resolve(candidate);
  return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + sep));
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFilesRecursive(dir, base = dir, output = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      listFilesRecursive(full, base, output);
    } else {
      output.push(full.slice(base.length + 1).split(sep).join('/'));
    }
  }
  return output;
}

// ---------------- adapters ----------------

/** cherry-verify: run scripts/verify.mjs inside a bundle directory. */
async function adapterVerify(job) {
  const dir = job.input?.bundleDir;
  if (!dir || !withinRoots(dir)) throw new Error('bundleDir missing or outside approved roots');
  const script = join(resolve(dir), 'scripts', 'verify.mjs');
  if (!existsSync(script)) throw new Error('bundle has no scripts/verify.mjs');
  return runProcess(process.execPath, [script], resolve(dir), job.timeoutMs);
}

/** cherry-export: hash-manifest a directory (deterministic, no network). */
async function adapterExport(job) {
  const dir = job.input?.dir;
  if (!dir || !withinRoots(dir)) throw new Error('dir missing or outside approved roots');
  const files = listFilesRecursive(resolve(dir));
  const manifest = {};
  for (const file of files.slice(0, 2000)) {
    manifest[file] = sha256File(join(resolve(dir), file));
  }
  const outputPath = join(stateDir, `export-${job.id}.json`);
  writeFileSync(outputPath, JSON.stringify({ algorithm: 'SHA-256', dir: resolve(dir), files: manifest }, null, 2));
  return { exitCode: 0, stdout: `Manifest of ${files.length} files written to ${outputPath}`, stderr: '' };
}

/** shell-safe: run an explicitly allowlisted executable with an argument array. */
async function adapterShellSafe(job) {
  const executable = job.input?.executable;
  const executableArguments = Array.isArray(job.input?.args) ? job.input.args.map(String) : [];
  if (!executable || !allowedExecutables.has(executable)) {
    throw new Error(`executable is not allowlisted (start the runner with --allow-exec <name>)`);
  }
  const cwd = job.workingDirectory ? resolve(job.workingDirectory) : allowedRoots[0];
  if (!withinRoots(cwd)) throw new Error('working directory outside approved roots');
  return runProcess(executable, executableArguments, cwd, job.timeoutMs);
}

/** Optional provider adapters: only run when the CLI exists on PATH. Exit code
 *  is recorded but NEVER treated as verification. */
async function adapterCli(binary, job) {
  const prompt = String(job.input?.prompt ?? '').slice(0, 8000);
  if (!prompt) throw new Error('prompt is required');
  const cwd = job.workingDirectory ? resolve(job.workingDirectory) : allowedRoots[0];
  if (!withinRoots(cwd)) throw new Error('working directory outside approved roots');
  const cliArguments = binary === 'codex' ? ['exec', prompt] : ['-p', prompt];
  const result = await runProcess(binary, cliArguments, cwd, job.timeoutMs);
  result.providerNote = 'Provider completion is not verification. Run cherry-verify afterwards.';
  return result;
}

function runProcess(executable, processArguments, cwd, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(executable, processArguments, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead */
        }
        rejectPromise(new Error(`timed out after ${timeoutMs}ms`));
      }
    }, Math.min(timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));

    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolvePromise({ exitCode: code ?? -1, stdout: redact(stdout), stderr: redact(stderr) });
      }
    });
  });
}

const ADAPTERS = {
  'cherry-verify': adapterVerify,
  'cherry-export': adapterExport,
  'shell-safe': adapterShellSafe,
  'codex-cli': (job) => adapterCli('codex', job),
  'claude-cli': (job) => adapterCli('claude', job),
};

// ---------------- queue (one at a time) ----------------
let working = false;

async function pump() {
  if (working) return;
  const job = jobs.find((candidate) => candidate.status === 'queued');
  if (!job) return;
  working = true;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  saveJobs(jobs);
  try {
    const adapter = ADAPTERS[job.adapter];
    if (!adapter) throw new Error(`unknown adapter ${job.adapter}`);
    const result = await adapter(job);
    job.status = result.exitCode === 0 ? 'succeeded' : 'failed';
    job.result = result;
  } catch (error) {
    job.status = job.status === 'cancelled' ? 'cancelled' : 'failed';
    job.result = { exitCode: -1, stdout: '', stderr: redact(error.message) };
  }
  job.finishedAt = new Date().toISOString();
  saveJobs(jobs);
  working = false;
  setImmediate(pump);
}

// ---------------- Runner v2: durable queue, events, scheduler ----------------
const v2Events = new EventsLog(join(dataDir, 'events.log'));
const v2Adapters = createAdapters({ allowedRoots, allowedExecutables });
const v2Concurrency = Math.min(3, Math.max(1, Number(argValues('--concurrency')[0]) || 1));
const v2Queue = new DurableQueue({ dataDir, events: v2Events, concurrency: v2Concurrency });
const v2Executor = (envelope, context) => v2Adapters.run(envelope, context);

/** Routines materialise into envelope jobs; idempotencyKey makes each due time exactly-once. */
function materialiseRoutine(routine, dueIso) {
  const envelope = {
    ...routine.envelope,
    schemaVersion: 1,
    idempotencyKey: `${routine.id}@${dueIso}`,
    createdAt: new Date().toISOString(),
  };
  envelope.actionHash = computeActionHash(envelope);
  v2Queue.enqueue(envelope);
  v2Queue.runPending(v2Executor);
}

const v2Scheduler = new Scheduler({ dataDir, materialise: materialiseRoutine });
const v2Timer = setInterval(() => {
  v2Queue.expireLeases();
  v2Queue.runPending(v2Executor);
  v2Scheduler.tick();
}, 1000);
v2Timer.unref();

// ---------------- HTTP API ----------------
function readJsonBody(request, response, origin, onBody) {
  let raw = '';
  request.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 64 * 1024) request.destroy();
  });
  request.on('end', () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(response, 400, { error: 'invalid JSON' }, origin);
    }
    onBody(body);
  });
}
function send(response, status, body, origin) {
  const headers = {
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'content-type, x-cherry-pair';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return send(response, 403, { error: 'origin not allowed' });
  }
  if (request.method === 'OPTIONS') {
    return send(response, 204, {}, origin);
  }

  const authorized = request.headers['x-cherry-pair'] === pairToken;
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (request.method === 'GET' && url.pathname === '/status') {
    return send(
      response,
      200,
      {
        version: VERSION,
        paired: authorized,
        queueDepth: jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
        adapters: Object.keys(ADAPTERS),
        v2: {
          adapters: v2Adapters.names,
          concurrency: v2Concurrency,
          queueDepth: v2Queue.list().filter((job) => ['queued', 'leased', 'running'].includes(job.status)).length,
          eventsHead: { seq: v2Events.seq, chain: v2Events.chain },
        },
      },
      origin,
    );
  }

  if (!authorized) {
    return send(response, 401, { error: 'pairing token required' }, origin);
  }

  if (request.method === 'GET' && url.pathname === '/jobs') {
    return send(response, 200, { jobs: jobs.slice(-100) }, origin);
  }

  if (request.method === 'POST' && url.pathname === '/jobs') {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) request.destroy();
    });
    request.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(response, 400, { error: 'invalid JSON' }, origin);
      }
      if (typeof body.adapter !== 'string' || !(body.adapter in ADAPTERS)) {
        return send(response, 400, { error: 'unknown adapter' }, origin);
      }
      if (body.workingDirectory !== undefined) {
        if (typeof body.workingDirectory !== 'string' || !isAbsolute(body.workingDirectory) || !withinRoots(body.workingDirectory)) {
          return send(response, 400, { error: 'workingDirectory outside approved roots' }, origin);
        }
      }
      const job = {
        id: `job-${randomBytes(8).toString('hex')}`,
        workspaceId: String(body.workspaceId ?? 'unknown').slice(0, 160),
        missionId: String(body.missionId ?? 'unknown').slice(0, 160),
        adapter: body.adapter,
        workingDirectory: body.workingDirectory,
        input: body.input && typeof body.input === 'object' ? body.input : {},
        timeoutMs: Math.min(Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      jobs.push(job);
      saveJobs(jobs);
      setImmediate(pump);
      return send(response, 201, { jobId: job.id }, origin);
    });
    return;
  }

  // ---------------- v2 routes ----------------
  if (request.method === 'GET' && url.pathname === '/events') {
    const sinceRaw = Number(url.searchParams.get('since') ?? 0);
    const since = Number.isFinite(sinceRaw) ? sinceRaw : 0;
    return send(
      response,
      200,
      { events: v2Events.readSince(since), head: { seq: v2Events.seq, chain: v2Events.chain } },
      origin,
    );
  }

  if (request.method === 'GET' && url.pathname === '/v2/jobs') {
    return send(response, 200, { jobs: v2Queue.list().slice(-100) }, origin);
  }

  if (request.method === 'POST' && url.pathname === '/v2/jobs') {
    readJsonBody(request, response, origin, (body) => {
      const envelope = body?.envelope;
      const problems = validateEnvelope(envelope);
      if (problems.length > 0) return send(response, 400, { error: problems.join('; ') }, origin);
      if (!v2Adapters.has(envelope.adapter)) return send(response, 400, { error: `unknown adapter ${envelope.adapter}` }, origin);
      const timeoutMs = Number(body.timeoutMs) > 0 ? Math.min(Number(body.timeoutMs), MAX_TIMEOUT_MS) : undefined;
      const outcome = v2Queue.enqueue(envelope, { timeoutMs });
      if (!outcome.ok) {
        return send(response, outcome.code === 'duplicate' ? 409 : 400, { error: outcome.reason }, origin);
      }
      v2Queue.runPending(v2Executor);
      return send(response, 201, { jobId: outcome.jobId }, origin);
    });
    return;
  }

  const v2JobMatch = /^\/v2\/jobs\/([A-Za-z0-9-]+)(\/cancel)?$/.exec(url.pathname);
  if (v2JobMatch) {
    const job = v2Queue.getJob(v2JobMatch[1]);
    if (!job) return send(response, 404, { error: 'job not found' }, origin);
    if (request.method === 'POST' && v2JobMatch[2] === '/cancel') {
      return send(response, 200, { job: v2Queue.cancel(job.id) }, origin);
    }
    if (request.method === 'GET') {
      return send(response, 200, { job }, origin);
    }
  }

  if (request.method === 'POST' && url.pathname === '/v2/routines') {
    readJsonBody(request, response, origin, (body) => {
      const routines = Array.isArray(body?.routines) ? body.routines : null;
      if (!routines) return send(response, 400, { error: 'routines must be an array' }, origin);
      for (const routine of routines) {
        const problems = validateRoutine(routine);
        if (routine?.envelope === undefined || typeof routine.envelope !== 'object') {
          problems.push('envelope template is required');
        } else if (!v2Adapters.has(routine.envelope.adapter)) {
          problems.push(`unknown adapter ${routine.envelope?.adapter}`);
        }
        if (problems.length > 0) {
          return send(response, 400, { error: `routine ${routine?.id ?? '?'}: ${problems.join('; ')}` }, origin);
        }
      }
      v2Scheduler.setRoutines(routines);
      const materialised = v2Scheduler.tick();
      return send(response, 200, { routines: routines.length, materialised }, origin);
    });
    return;
  }

  const jobMatch = /^\/jobs\/([A-Za-z0-9-]+)(\/cancel)?$/.exec(url.pathname);
  if (jobMatch) {
    const job = jobs.find((candidate) => candidate.id === jobMatch[1]);
    if (!job) return send(response, 404, { error: 'job not found' }, origin);
    if (request.method === 'POST' && jobMatch[2] === '/cancel') {
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.finishedAt = new Date().toISOString();
        saveJobs(jobs);
      }
      return send(response, 200, { job }, origin);
    }
    if (request.method === 'GET') {
      return send(response, 200, { job }, origin);
    }
  }

  return send(response, 404, { error: 'not found' }, origin);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cherry Runner v${VERSION} listening on http://127.0.0.1:${PORT}`);
  console.log(`Approved roots: ${allowedRoots.join(', ')}`);
  console.log(`Allowed executables: ${[...allowedExecutables].join(', ') || '(none — deterministic adapters only)'}`);
  console.log('');
  console.log(`PAIRING TOKEN (enter this in Cherry Studio → Connections):`);
  console.log(`  ${pairToken}`);
});
