#!/usr/bin/env node
/**
 * Production route health checks for Cherry's hourly maintenance workflow.
 * Node built-ins only; no credentials and no mutation of the live app.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CANONICAL_URL = 'https://cherry-wine.vercel.app';
export const DEFAULT_ROUTES = ['/', '/showcase', '/compatibility', '/connect'];
const DEFAULT_OUTPUT = 'artifacts/hourly/health.json';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 1_000_000;

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol for health check: ${parsed.protocol}`);
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed;
}

function routeUrl(baseUrl, route) {
  if (!route.startsWith('/') || route.startsWith('//')) {
    throw new Error(`Health-check routes must be same-origin absolute paths: ${route}`);
  }
  return new URL(route, baseUrl);
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

export async function checkRoute({
  baseUrl,
  route,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available.');
  const startedAt = clock();
  const url = routeUrl(baseUrl, route);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'cherry-hourly-health/1.0',
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    const sameOrigin = new URL(response.url || url).origin === baseUrl.origin;
    const checks = {
      status2xx: response.status >= 200 && response.status < 300,
      html: /text\/html|application\/xhtml\+xml/i.test(contentType),
      sameOrigin,
      appShell: /<div\s+id=["']root["'][^>]*>/i.test(body),
      cherryTitle: /<title>[^<]*Cherry[^<]*<\/title>/i.test(body),
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    return {
      route,
      url: url.href,
      finalUrl: response.url || url.href,
      ok: failedChecks.length === 0,
      status: response.status,
      contentType,
      durationMs: Math.max(0, clock() - startedAt),
      checks,
      failedChecks,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      route,
      url: url.href,
      finalUrl: null,
      ok: false,
      status: null,
      contentType: null,
      durationMs: Math.max(0, clock() - startedAt),
      checks: {},
      failedChecks: [timedOut ? 'timeout' : 'request'],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthChecks({
  baseUrl = CANONICAL_URL,
  routes = DEFAULT_ROUTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
} = {}) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const startedAt = nowIso(clock);
  const results = [];
  for (const route of routes) {
    results.push(await checkRoute({ baseUrl: normalizedBase, route, timeoutMs, fetchImpl, clock }));
  }
  const failed = results.filter((result) => !result.ok);
  return {
    schemaVersion: 1,
    baseUrl: normalizedBase.origin,
    startedAt,
    finishedAt: nowIso(clock),
    ok: failed.length === 0,
    checked: results.length,
    failed: failed.length,
    routes: results,
  };
}

export async function writeHealthReport(report, outputPath = DEFAULT_OUTPUT) {
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return absolutePath;
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.CHERRY_BASE_URL?.trim() || CANONICAL_URL,
    outputPath: process.env.CHERRY_HEALTH_OUTPUT?.trim() || DEFAULT_OUTPUT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--base-url' && value) {
      options.baseUrl = value;
      index += 1;
    } else if (flag === '--output' && value) {
      options.outputPath = value;
      index += 1;
    } else if (flag === '--timeout-ms' && value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 100 || parsed > 120_000) {
        throw new Error('--timeout-ms must be an integer between 100 and 120000.');
      }
      options.timeoutMs = parsed;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`hourly-health: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const report = await runHealthChecks({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.clock ? { clock: dependencies.clock } : {}),
  });
  const reportPath = await writeHealthReport(report, options.outputPath);

  for (const result of report.routes) {
    const status = result.status ?? 'ERR';
    const detail = result.ok ? 'healthy' : `failed: ${result.failedChecks.join(', ')}`;
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.route} ${status} ${detail} (${result.durationMs}ms)`);
  }
  console.log(`hourly-health: ${report.checked - report.failed}/${report.checked} healthy; report ${reportPath}`);
  return report.ok ? 0 : 1;
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executedDirectly) {
  process.exitCode = await runCli();
}
