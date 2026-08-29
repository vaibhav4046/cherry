#!/usr/bin/env node
/**
 * Cherry native MCP bridge — a dependency-free stdio MCP server exposing a
 * NARROW read/verify surface over exported Cherry workspace files.
 *
 * The Studio persists to browser IndexedDB, which a Node process cannot read.
 * This bridge therefore operates on workspace exports and skill bundles the
 * user has saved to disk:
 *
 *   node runner/mcp/server.mjs --workspace path/to/export.json --bundles path/to/bundles
 *
 * It can read summaries and recompute proof hashes. It cannot grant approvals,
 * read unrelated files, or touch environment variables — mutations happen in
 * the Studio where the human can see them.
 */
import { createInterface } from 'node:readline';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const workspacePath = argValue('--workspace') ? resolve(argValue('--workspace')) : null;
const bundlesDir = argValue('--bundles') ? resolve(argValue('--bundles')) : null;

function loadWorkspace() {
  if (!workspacePath || !existsSync(workspacePath)) {
    throw new Error('No workspace export configured. Start with --workspace <export.json>.');
  }
  return JSON.parse(readFileSync(workspacePath, 'utf8'));
}

function canonicalize(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalize(item === undefined ? null : item)).join(',') + ']';
  if (type === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  throw new TypeError('cannot canonicalize ' + type);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const TOOLS = [
  {
    name: 'read_workspace_summary',
    description: 'Read a summary of the configured Cherry workspace export: workspace, missions, skills, memories, receipts.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    handler: () => {
      const data = loadWorkspace();
      return {
        workspace: data.workspace,
        missionCount: data.missions?.length ?? 0,
        missions: (data.missions ?? []).slice(0, 20).map((mission) => ({ id: mission.id, title: mission.title, state: mission.state })),
        skillCount: data.skillGraphs?.length ?? 0,
        approvedMemories: (data.memories ?? []).filter((memory) => memory.status === 'approved').length,
        receiptCount: data.proofReceipts?.length ?? 0,
        exportedAt: data.exportedAt,
      };
    },
  },
  {
    name: 'list_skills',
    description: 'List skill graphs in the workspace export with status, version, and revision.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    handler: () => ({
      skills: (loadWorkspace().skillGraphs ?? []).map((graph) => ({
        id: graph.id,
        name: graph.name,
        status: graph.status,
        version: graph.version,
        revision: graph.revision,
        approvedRevision: graph.approvedRevision ?? null,
      })),
    }),
  },
  {
    name: 'verify_workspace_integrity',
    description: 'Recompute the workspace export integrity hash (SHA-256 over RFC 8785 canonical JSON) and report whether it matches.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    handler: () => {
      const data = loadWorkspace();
      const stored = data.integrity?.payloadSha256 ?? null;
      const clone = { ...data };
      delete clone.integrity;
      const recomputed = sha256(canonicalize(clone));
      return { stored, recomputed, matches: stored === recomputed };
    },
  },
  {
    name: 'verify_receipt',
    description: 'Recompute a proof receipt hash from the workspace export by receipt id. Tamper-evident, not a signature.',
    inputSchema: {
      type: 'object',
      properties: { receiptId: { type: 'string', description: 'Receipt id from the export' } },
      required: ['receiptId'],
      additionalProperties: false,
    },
    handler: (input) => {
      const data = loadWorkspace();
      const receipt = (data.proofReceipts ?? []).find((candidate) => candidate.receiptId === input.receiptId);
      if (!receipt) throw new Error(`receipt ${input.receiptId} not found`);
      const clone = JSON.parse(JSON.stringify(receipt));
      for (const exclusion of receipt.canonicalization?.exclusions ?? ['receiptHash']) delete clone[exclusion];
      const recomputed = sha256(canonicalize(clone));
      return { receiptId: receipt.receiptId, stored: receipt.receiptHash, recomputed, matches: recomputed === receipt.receiptHash };
    },
  },
  {
    name: 'list_skill_bundles',
    description: 'List compiled skill bundle directories in the configured bundles directory.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    handler: () => {
      if (!bundlesDir || !existsSync(bundlesDir)) return { bundles: [], note: 'No --bundles directory configured or it does not exist.' };
      const bundles = readdirSync(bundlesDir).filter((entry) => existsSync(join(bundlesDir, entry, 'SKILL.md')));
      return { bundles };
    },
  },
];

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

const readline = createInterface({ input: process.stdin, terminal: false });
readline.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;
  try {
    if (method === 'initialize') {
      respond(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'cherry-bridge', version: '1.0.0' },
      });
    } else if (method === 'notifications/initialized') {
      // no response for notifications
    } else if (method === 'tools/list') {
      respond(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    } else if (method === 'tools/call') {
      const tool = TOOLS.find((candidate) => candidate.name === params?.name);
      if (!tool) return respondError(id, -32602, `unknown tool ${params?.name}`);
      try {
        const result = tool.handler(params?.arguments ?? {});
        respond(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2).slice(0, 8000) }] });
      } catch (error) {
        respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true });
      }
    } else if (method === 'ping') {
      respond(id, {});
    } else if (id !== undefined) {
      respondError(id, -32601, `method ${method} not implemented`);
    }
  } catch (error) {
    if (id !== undefined) respondError(id, -32603, error.message);
  }
});
