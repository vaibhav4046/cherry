import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
let child;
let workDir;
let nextId = 1;
const pending = new Map();

function canonicalize(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return Object.is(value, -0) ? '0' : String(value);
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalize(item === undefined ? null : item)).join(',') + ']';
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
}

function rpc(method, params) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolvePromise, rejectPromise) => {
    pending.set(id, { resolvePromise, rejectPromise });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rejectPromise(new Error(`rpc ${method} timed out`));
      }
    }, 10_000);
  });
}

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'cherry-bridge-test-'));
  const workspaceExport = {
    schemaVersion: '1.0.0',
    exportId: 'ws-TEST',
    exportedAt: '2026-08-29T00:00:00.000Z',
    workspace: { id: 'ws-1', name: 'Bridge workspace', revision: 1, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' },
    missions: [{ id: 'ms-1', title: 'Bridge mission', state: 'COMPLETE' }],
    skillGraphs: [{ id: 'sg-1', name: 'Bridge skill', status: 'approved', version: '1.0.0', revision: 3, approvedRevision: 3 }],
    memories: [{ id: 'mem-1', status: 'approved' }],
    proofReceipts: [],
  };
  const receipt = {
    schemaVersion: '1.0.0',
    receiptId: 'rc-1',
    status: 'verified',
    canonicalization: { algorithm: 'JCS-RFC8785', hashAlgorithm: 'SHA-256', exclusions: ['receiptHash'] },
    receiptHash: '',
  };
  const clone = { ...receipt };
  delete clone.receiptHash;
  receipt.receiptHash = createHash('sha256').update(canonicalize(clone), 'utf8').digest('hex');
  workspaceExport.proofReceipts.push(receipt);
  // Integrity hash over everything except `integrity`.
  workspaceExport.integrity = {
    canonicalization: 'JCS-RFC8785',
    hashAlgorithm: 'SHA-256',
    payloadSha256: createHash('sha256').update(canonicalize(workspaceExport), 'utf8').digest('hex'),
  };
  writeFileSync(join(workDir, 'export.json'), JSON.stringify(workspaceExport));

  child = spawn(process.execPath, [join(here, 'server.mjs'), '--workspace', join(workDir, 'export.json')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter.resolvePromise(message);
        }
      } catch {
        /* ignore non-JSON */
      }
      index = buffer.indexOf('\n');
    }
  });
});

after(() => {
  child?.kill('SIGKILL');
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* windows */
  }
});

test('initialize handshake succeeds', async () => {
  const response = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(response.result.serverInfo.name, 'cherry-bridge');
});

test('tools/list exposes the narrow read/verify surface only', async () => {
  const response = await rpc('tools/list', {});
  const names = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(
    names.sort(),
    ['list_skill_bundles', 'list_skills', 'read_workspace_summary', 'verify_receipt', 'verify_workspace_integrity'].sort(),
  );
  // No approval-granting or file-writing tool exists.
  assert.ok(!names.some((name) => /approve|write|delete|exec/.test(name)));
});

test('read_workspace_summary reads the export', async () => {
  const response = await rpc('tools/call', { name: 'read_workspace_summary', arguments: {} });
  const body = JSON.parse(response.result.content[0].text);
  assert.equal(body.workspace.name, 'Bridge workspace');
  assert.equal(body.missionCount, 1);
});

test('verify_workspace_integrity recomputes and matches', async () => {
  const response = await rpc('tools/call', { name: 'verify_workspace_integrity', arguments: {} });
  const body = JSON.parse(response.result.content[0].text);
  assert.equal(body.matches, true);
});

test('verify_receipt recomputes the receipt hash', async () => {
  const response = await rpc('tools/call', { name: 'verify_receipt', arguments: { receiptId: 'rc-1' } });
  const body = JSON.parse(response.result.content[0].text);
  assert.equal(body.matches, true);
});

test('unknown tool is refused', async () => {
  const response = await rpc('tools/call', { name: 'grant_approval', arguments: {} });
  assert.ok(response.error);
});
