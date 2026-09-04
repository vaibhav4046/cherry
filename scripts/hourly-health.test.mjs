import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCli, runHealthChecks } from './hourly-health.mjs';

const APP_HTML = '<!doctype html><html><head><title>Cherry · Test</title></head><body><div id="root"></div></body></html>';

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('all required routes pass only when the Cherry app shell is returned', async () => {
  await withServer((request, response) => {
    assert.ok(['/', '/showcase', '/compatibility', '/connect'].includes(request.url ?? ''));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(APP_HTML);
  }, async (baseUrl) => {
    const report = await runHealthChecks({ baseUrl, timeoutMs: 2_000 });
    assert.equal(report.ok, true);
    assert.equal(report.checked, 4);
    assert.equal(report.failed, 0);
    assert.ok(report.routes.every((route) => route.checks.appShell && route.checks.cherryTitle));
  });
});

test('a bad route makes the report fail without hiding the healthy routes', async () => {
  await withServer((request, response) => {
    if (request.url === '/compatibility') {
      response.writeHead(503, { 'content-type': 'text/plain' });
      response.end('maintenance');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(APP_HTML);
  }, async (baseUrl) => {
    const report = await runHealthChecks({ baseUrl, timeoutMs: 2_000 });
    assert.equal(report.ok, false);
    assert.equal(report.checked, 4);
    assert.equal(report.failed, 1);
    const failed = report.routes.find((route) => route.route === '/compatibility');
    assert.equal(failed?.status, 503);
    assert.deepEqual(failed?.failedChecks.sort(), ['appShell', 'cherryTitle', 'html', 'status2xx']);
  });
});

test('the CLI writes machine-readable evidence and returns a non-zero status on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cherry-health-'));
  const output = join(directory, 'health.json');
  try {
    await withServer((request, response) => {
      response.writeHead(request.url === '/connect' ? 500 : 200, { 'content-type': 'text/html' });
      response.end(APP_HTML);
    }, async (baseUrl) => {
      const status = await runCli(['--base-url', baseUrl, '--output', output, '--timeout-ms', '2000']);
      assert.equal(status, 1);
    });
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.ok, false);
    assert.equal(report.failed, 1);
    assert.equal(report.routes.find((route) => route.route === '/connect').status, 500);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
