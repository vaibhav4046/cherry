/**
 * Agent host and check-runner tests: probes against fake executables, argv
 * built only from observed flags, output caps, redaction, timeouts,
 * cancellation, the mock and manual hosts, deterministic checks, and the
 * additive mission adapters. Imported by runner.test.mjs.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeActionHash } from './lib/canonical.mjs';
import { createAdapters } from './lib/adapters.mjs';
import { runChecks } from './lib/checks.mjs';
import {
  DANGER_FLAGS,
  HOST_DESCRIPTORS,
  buildHostArgv,
  createAgentHosts,
  probeHosts,
  runHostTask,
} from './lib/agent-hosts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_HOST = join(here, 'test-fixtures', 'fake-host.mjs');
const tempDirs = [];

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows file locks */
    }
  }
});

const fake = (flavour, flags = 'all') => [process.execPath, FAKE_HOST, flavour, `--flags=${flags}`];
const sandbox = () => ({ root: tempDir('host-sb-') });
const echoedArgv = (result) => JSON.parse(result.stdout.split('\n')[0]).argv;
const hasDangerFlag = (argv) => argv.some((item) => DANGER_FLAGS.some((flag) => String(item).includes(flag)));

async function runFake(flavour, flags, task, options = {}) {
  const hosts = createAgentHosts({ commands: { [flavour]: fake(flavour, flags) }, searchPath: false });
  const root = options.root ?? sandbox().root;
  const result = await hosts.run(flavour, { text: task, attempt: 1, ...(options.task ?? {}) }, { root }, { timeoutMs: options.timeoutMs ?? 10_000, signal: options.signal });
  return { result, root };
}

// ---------------- probes ----------------

test('probeHosts reports fake codex and claude with versions and observed flags, and honest statuses elsewhere', async () => {
  const probes = await probeHosts({ commands: { codex: fake('codex'), claude: fake('claude', 'partial') }, allowMockHost: true, searchPath: false });
  assert.deepEqual(probes.map((probe) => probe.hostId), HOST_DESCRIPTORS.map((descriptor) => descriptor.hostId));
  const byId = Object.fromEntries(probes.map((probe) => [probe.hostId, probe]));

  assert.equal(byId.codex.available, true);
  assert.equal(byId.codex.version, 'fake-codex 9.9.9');
  assert.equal(byId.codex.status, 'shipped_tested');
  assert.equal(byId.codex.kind, 'codex-cli');
  assert.equal(byId.codex.boundary, 'process');
  assert.deepEqual(byId.codex.details.flags, { '--sandbox': true, '-C': true, '--cd': true, '--skip-git-repo-check': true, '--output-last-message': true, '--json': true });
  assert.equal(byId.codex.authenticated, null, 'a version probe cannot prove login');

  assert.equal(byId.claude.available, true);
  assert.equal(byId.claude.status, 'shipped_tested');
  assert.deepEqual(byId.claude.details.flags, { '-p': true, '--output-format': true, '--permission-mode': false, '--add-dir': false, '--max-turns': false });

  for (const hostId of ['kilo', 'kimi', 'ollama', 'omniroute', 'openai-compatible']) {
    assert.equal(byId[hostId].available, false, hostId);
    assert.equal(byId[hostId].status, 'unavailable', hostId);
    assert.ok(byId[hostId].details.reason, hostId);
  }
  assert.equal(byId.mock.available, true);
  assert.equal(byId.mock.status, 'shipped_tested');
  assert.equal(byId.manual.available, true);
  assert.equal(byId.manual.boundary, 'unknown');
  for (const probe of probes) assert.match(probe.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

  const noMock = await probeHosts({ commands: {}, searchPath: false });
  assert.equal(noMock.find((probe) => probe.hostId === 'mock').status, 'unavailable');
  assert.equal(noMock.find((probe) => probe.hostId === 'codex').status, 'unavailable');
});

test('an unavailable host reports a reason without throwing, and running it fails cleanly', async () => {
  const probes = await probeHosts({ commands: { codex: join(tmpdir(), 'definitely-missing-codex-binary'), kilo: fake('codex') }, searchPath: false });
  const codex = probes.find((probe) => probe.hostId === 'codex');
  assert.equal(codex.available, false);
  assert.equal(codex.status, 'unavailable');
  assert.match(codex.details.reason, /not found|ENOENT|spawn/i);
  const kilo = probes.find((probe) => probe.hostId === 'kilo');
  assert.equal(kilo.available, true, 'a probe-only host that answers --version is found');
  assert.equal(kilo.status, 'experimental');

  const result = await runHostTask('codex', { text: 'hello', attempt: 1 }, sandbox(), { command: join(tmpdir(), 'definitely-missing-codex-binary'), timeoutMs: 5000 });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /unavailable|not found/i);

  const probeOnly = await runHostTask('kilo', { text: 'hello', attempt: 1 }, sandbox(), { command: fake('codex'), timeoutMs: 5000 });
  assert.equal(probeOnly.status, 'failed');
  assert.match(probeOnly.reason, /probe only/i);
});

// ---------------- argv from observed flags ----------------

test('codex argv is built only from flags observed in the probe and never carries a danger flag', async () => {
  const all = await runFake('codex', 'all', 'Do the task');
  assert.deepEqual(echoedArgv(all.result), [
    'exec', '--sandbox', 'workspace-write', '-C', all.root, '--skip-git-repo-check',
    '--output-last-message', join(all.root, '.cherry', 'LAST.md'), 'Do the task',
  ]);
  assert.equal(all.result.status, 'completed');

  const partial = await runFake('codex', 'partial', 'Do the task');
  assert.deepEqual(echoedArgv(partial.result), ['exec', '--sandbox', 'workspace-write', '--cd', partial.root, 'Do the task']);

  const none = await runFake('codex', 'none', 'Do the task');
  assert.deepEqual(echoedArgv(none.result), ['exec', 'Do the task']);

  for (const { result } of [all, partial, none]) {
    assert.equal(hasDangerFlag(echoedArgv(result)), false);
    assert.equal(hasDangerFlag(result.argv), false);
  }
  const flags = Object.fromEntries(['--sandbox', '-C', '--cd', '--skip-git-repo-check', '--output-last-message', '--json'].map((flag) => [flag, true]));
  assert.throws(() => buildHostArgv('codex', flags, { root: all.root, prompt: 'x --dangerously-skip-permissions' }), /danger/);
});

test('claude argv uses -p, --output-format json and --permission-mode acceptEdits only when observed', async () => {
  const all = await runFake('claude', 'all', 'Write the brief');
  assert.deepEqual(echoedArgv(all.result), ['-p', 'Write the brief', '--output-format', 'json', '--permission-mode', 'acceptEdits']);
  const partial = await runFake('claude', 'partial', 'Write the brief');
  assert.deepEqual(echoedArgv(partial.result), ['-p', 'Write the brief', '--output-format', 'json']);
  const none = await runFake('claude', 'none', 'Write the brief');
  assert.deepEqual(echoedArgv(none.result), ['-p', 'Write the brief']);
  for (const { result } of [all, partial, none]) assert.equal(hasDangerFlag(echoedArgv(result)), false);
});

// ---------------- process discipline ----------------

test('captured output is capped at 256 KiB and marked truncated', async () => {
  const { result } = await runFake('codex', 'all', 'print [[big]]');
  assert.equal(result.status, 'completed');
  assert.ok(result.stdout.length <= 256 * 1024, `stdout length ${result.stdout.length}`);
  assert.equal(result.truncated, true);
});

test('secret-shaped strings are redacted from host output', async () => {
  const { result, root } = await runFake('codex', 'all', 'leak [[secret]]');
  assert.ok(!result.stdout.includes('sk-abcdefghijklmnop1234'));
  assert.match(result.stdout, /token \[redacted\] end/);
  assert.ok(!readFileSync(join(root, result.stdoutArtifact), 'utf8').includes('sk-abcdefghijklmnop1234'));
});

test('a host that exceeds the timeout is killed and reported as failed', async () => {
  const startedAt = Date.now();
  const { result } = await runFake('codex', 'all', 'wait [[sleep:5000]]', { timeoutMs: 200 });
  assert.equal(result.status, 'failed');
  assert.equal(result.timedOut, true);
  assert.match(result.reason, /timed out/);
  assert.ok(Date.now() - startedAt < 4000, 'the child did not run to completion');
});

test('cancellation through an AbortSignal fails the run', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('cancelled')), 100);
  const { result } = await runFake('codex', 'all', 'wait [[sleep:5000]]', { timeoutMs: 10_000, signal: controller.signal });
  assert.equal(result.status, 'failed');
  assert.equal(result.aborted, true);
  assert.match(result.reason, /aborted|cancelled/);
});

test('exit codes map to completed or failed, never verified', async () => {
  const failed = await runFake('claude', 'all', 'break [[exit:2]] [[stderr:boom]]');
  assert.equal(failed.result.status, 'failed');
  assert.equal(failed.result.exitCode, 2);
  assert.match(failed.result.stderr, /boom/);
  const ok = await runFake('claude', 'all', 'fine');
  assert.equal(ok.result.status, 'completed');
  assert.equal(ok.result.exitCode, 0);
  for (const { result } of [ok, failed]) {
    assert.notEqual(result.status, 'verified');
    assert.equal(result.note, 'Provider completion is not verification.');
    assert.equal(result.providerVersion, 'fake-claude 9.9.9');
    assert.equal(typeof result.wallClockMs, 'number');
    assert.equal(result.hostId, 'claude');
  }
});

test('task text is always written to .cherry/TASK.md and long tasks are referenced from the prompt', async () => {
  const short = await runFake('codex', 'none', 'short task [[write:out/short.txt=ok]]', { task: { contextText: 'context body' } });
  assert.equal(readFileSync(join(short.root, '.cherry', 'TASK.md'), 'utf8'), 'short task [[write:out/short.txt=ok]]');
  assert.equal(readFileSync(join(short.root, '.cherry', 'CONTEXT.md'), 'utf8'), 'context body');
  assert.deepEqual(echoedArgv(short.result), ['exec', 'short task [[write:out/short.txt=ok]]']);
  assert.equal(readFileSync(join(short.root, 'out', 'short.txt'), 'utf8'), 'ok');

  const longText = 'x'.repeat(6001) + ' [[write:out/long.txt=done]]';
  const long = await runFake('codex', 'none', longText);
  assert.deepEqual(echoedArgv(long.result), ['exec', 'Read .cherry/TASK.md and follow it. Context, if any, is in .cherry/CONTEXT.md.']);
  assert.equal(readFileSync(join(long.root, '.cherry', 'TASK.md'), 'utf8'), longText);
  assert.equal(readFileSync(join(long.root, 'out', 'long.txt'), 'utf8'), 'done', 'the fake host followed the task file');
});

// ---------------- mock and manual hosts ----------------

test('the mock host runs the JSON script for the requested attempt inside the sandbox only', async () => {
  const hosts = createAgentHosts({ allowMockHost: true, searchPath: false });
  const { root } = sandbox();
  const mock = {
    attempts: [
      { writeFiles: { 'out/a.txt': 'A' }, exitCode: 0 },
      { writeFiles: { 'out/b.txt': 'B' }, sleepMs: 10, exitCode: 1 },
    ],
  };
  const first = await hosts.run('mock', { text: 'do a', attempt: 1, mock }, { root }, { timeoutMs: 5000 });
  assert.equal(first.status, 'completed');
  assert.equal(readFileSync(join(root, 'out', 'a.txt'), 'utf8'), 'A');
  const second = await hosts.run('mock', { text: 'do b', attempt: 2, mock }, { root }, { timeoutMs: 5000 });
  assert.equal(second.status, 'failed');
  assert.equal(second.exitCode, 1);
  assert.equal(readFileSync(join(root, 'out', 'b.txt'), 'utf8'), 'B');
  assert.equal(readFileSync(join(root, '.cherry', 'TASK.md'), 'utf8'), 'do b');

  const escape = await hosts.run('mock', { text: 'escape', attempt: 1, mock: { attempts: [{ writeFiles: { '../escaped.txt': 'x' } }] } }, { root }, { timeoutMs: 5000 });
  assert.equal(escape.status, 'failed');
  assert.match(escape.reason, /escapes/);
  assert.equal(existsSync(join(root, '..', 'escaped.txt')), false);

  const disabled = await createAgentHosts({ allowMockHost: false, searchPath: false }).run('mock', { text: 'x', attempt: 1, mock }, { root }, { timeoutMs: 5000 });
  assert.equal(disabled.status, 'failed');
  assert.match(disabled.reason, /not enabled/);

  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('cancelled')), 50);
  const cancelled = await hosts.run('mock', { text: 'slow', attempt: 1, mock: { attempts: [{ sleepMs: 5000 }] } }, { root }, { timeoutMs: 5000, signal: controller.signal });
  assert.equal(cancelled.status, 'failed');
  assert.equal(cancelled.aborted, true);
});

test('the manual host writes a handoff package and needs a person', async () => {
  const { root } = sandbox();
  const result = await createAgentHosts({ searchPath: false }).run('manual', { text: 'Please review the draft', attempt: 1 }, { root }, { timeoutMs: 5000 });
  assert.equal(result.status, 'needs_human');
  assert.match(readFileSync(join(root, '.cherry', 'HANDOFF.md'), 'utf8'), /Please review the draft/);
});

test('the mock host writes the expected outputs when no script is given and honours mock-fail-first', async () => {
  const hosts = createAgentHosts({ allowMockHost: true, searchPath: false, mockFailFirst: ['flaky'] });
  const { root } = sandbox();
  const first = await hosts.run('mock', { text: 'do a', attempt: 1, nodeId: 'a', outputs: ['out/a.txt', 'docs/notes.md'] }, { root }, { timeoutMs: 5000 });
  assert.equal(first.status, 'completed');
  assert.equal(readFileSync(join(root, 'out', 'a.txt'), 'utf8'), 'written by the mock host for a attempt 1\n');
  assert.equal(readFileSync(join(root, 'docs', 'notes.md'), 'utf8'), 'written by the mock host for a attempt 1\n');

  const flakyRoot = sandbox().root;
  const skipped = await hosts.run('mock', { text: 'do flaky', attempt: 1, nodeId: 'flaky', outputs: ['out/flaky.txt'] }, { root: flakyRoot }, { timeoutMs: 5000 });
  assert.equal(skipped.status, 'completed', 'the first attempt exits 0 but writes nothing');
  assert.equal(existsSync(join(flakyRoot, 'out', 'flaky.txt')), false);
  const second = await hosts.run('mock', { text: 'do flaky', attempt: 2, nodeId: 'flaky', outputs: ['out/flaky.txt'] }, { root: flakyRoot }, { timeoutMs: 5000 });
  assert.equal(second.status, 'completed');
  assert.equal(readFileSync(join(flakyRoot, 'out', 'flaky.txt'), 'utf8'), 'written by the mock host for flaky attempt 2\n');

  const escape = await hosts.run('mock', { text: 'x', attempt: 1, nodeId: 'a', outputs: ['../escaped-output.txt'] }, { root }, { timeoutMs: 5000 });
  assert.equal(escape.status, 'failed');
  assert.match(escape.reason, /escapes/);
  assert.equal(existsSync(join(root, '..', 'escaped-output.txt')), false);
});

test('the mock host writes the plan file targets with the text each file_contains check needs', async () => {
  const hosts = createAgentHosts({ allowMockHost: true, searchPath: false });
  const { root } = sandbox();
  const fileTargets = [
    { path: 'artifacts/priorities.md', contains: '## Priorities' },
    { path: 'artifacts/priorities.md', contains: '## Risks' },
    { path: 'out/a.txt', contains: null },
    { path: '', contains: 'ignored' },
  ];
  const result = await hosts.run('mock', { text: 'prioritise', attempt: 2, nodeId: 'prioritise', outputs: ['out/a.txt'], fileTargets }, { root }, { timeoutMs: 5000 });
  assert.equal(result.status, 'completed');
  const priorities = readFileSync(join(root, 'artifacts', 'priorities.md'), 'utf8');
  assert.ok(priorities.startsWith('written by the mock host for prioritise attempt 2\n'));
  assert.ok(priorities.includes('## Priorities') && priorities.includes('## Risks'), 'both headings are present');
  assert.equal(readFileSync(join(root, 'out', 'a.txt'), 'utf8'), 'written by the mock host for prioritise attempt 2\n');
  const escapeRoot = sandbox().root;
  const escape = await hosts.run('mock', { text: 'escape', attempt: 1, nodeId: 'x', fileTargets: [{ path: '../outside.md', contains: 'nope' }] }, { root: escapeRoot }, { timeoutMs: 5000 });
  assert.equal(escape.status, 'failed');
  assert.match(escape.reason, /escapes/);
  assert.equal(existsSync(join(escapeRoot, '..', 'outside.md')), false);
});

test('the mock host holds each attempt for --mock-delay-ms so rehearsals can show parallel work', async () => {
  const hosts = createAgentHosts({ allowMockHost: true, searchPath: false, mockDelayMs: 120 });
  const { root } = sandbox();
  const startedAt = Date.now();
  const result = await hosts.run('mock', { text: 'slow', attempt: 1, nodeId: 'slow', outputs: ['out/slow.txt'] }, { root }, { timeoutMs: 5000 });
  assert.equal(result.status, 'completed');
  assert.ok(Date.now() - startedAt >= 100, 'the attempt waited for the configured delay');
  assert.equal(readFileSync(join(root, 'out', 'slow.txt'), 'utf8'), 'written by the mock host for slow attempt 1' + String.fromCharCode(10));
});

test('agent-host maps browser host kinds to hosts: local-runner is the mock, manual hands off', async () => {
  const root = tempDir('ad-kinds-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), allowMockHost: true, searchPath: false });
  const payload = (hostKinds) => JSON.stringify({ nodeId: 'a', title: 'Node a', objective: 'Do a', definitionOfDone: ['done'], hostKinds, outputs: ['out/a.txt'] });
  const mocked = await adapters.run(envelopeFor({ workingDirectory: root, allowedExecutables: [], boundedPrompt: payload(['local-runner']) }), { timeoutMs: 5000 });
  assert.equal(mocked.status, 'completed');
  assert.equal(mocked.hostId, 'mock');
  assert.equal(readFileSync(join(root, 'out', 'a.txt'), 'utf8'), 'written by the mock host for a attempt 1\n');
  const manual = await adapters.run(envelopeFor({ workingDirectory: root, allowedExecutables: [], boundedPrompt: payload(['manual']) }), { timeoutMs: 5000 });
  assert.equal(manual.status, 'needs_human');
  assert.ok(existsSync(join(root, '.cherry', 'HANDOFF.md')));
  const noMock = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), searchPath: false });
  await assert.rejects(() => noMock.run(envelopeFor({ workingDirectory: root, allowedExecutables: [], boundedPrompt: payload(['local-runner']) })), /mock host/);
  await assert.rejects(() => noMock.run(envelopeFor({ workingDirectory: root, allowedExecutables: [], boundedPrompt: payload(['telepathy']) })), /no agent host matches/);
});

// ---------------- checks ----------------

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

test('runChecks passes and fails every check kind deterministically', async () => {
  const root = tempDir('checks-');
  mkdirSync(join(root, 'out'));
  writeFileSync(join(root, 'out', 'a.txt'), 'alpha beta');
  const specs = [
    { id: 'cmd-ok', kind: 'command', required: true, argv: ['node', '-e', 'process.exit(0)'], description: 'exits 0' },
    { id: 'cmd-code', kind: 'command', required: true, argv: ['node', '-e', 'process.exit(3)'], expectExitCode: 3, description: 'exits 3' },
    { id: 'cmd-bad', kind: 'command', required: false, argv: ['node', '-e', 'console.error("nope");process.exit(1)'], description: 'exits 1' },
    { id: 'file-ok', kind: 'file', required: true, path: 'out/a.txt', description: 'exists' },
    { id: 'file-missing', kind: 'file', required: false, path: 'out/missing.txt', description: 'missing' },
    { id: 'contains-ok', kind: 'file_contains', required: true, path: 'out/a.txt', contains: 'beta', description: 'contains beta' },
    { id: 'contains-bad', kind: 'file_contains', required: false, path: 'out/a.txt', contains: 'gamma', description: 'contains gamma' },
    { id: 'hash-ok', kind: 'hash', required: true, path: 'out/a.txt', expectedSha256: sha256('alpha beta'), description: 'hash matches' },
    { id: 'hash-bad', kind: 'hash', required: false, path: 'out/a.txt', expectedSha256: sha256('other'), description: 'hash differs' },
    { id: 'human', kind: 'human', required: false, description: 'a person looks' },
    JSON.stringify({ id: 'json-spec', kind: 'file', required: true, path: 'out/a.txt', description: 'JSON encoded spec' }),
  ];
  const report = await runChecks(specs, root, { timeoutMs: 10_000 });
  const statuses = Object.fromEntries(report.checks.map((check) => [check.id, check.status]));
  assert.deepEqual(statuses, {
    'cmd-ok': 'passed', 'cmd-code': 'passed', 'cmd-bad': 'failed', 'file-ok': 'passed', 'file-missing': 'failed',
    'contains-ok': 'passed', 'contains-bad': 'failed', 'hash-ok': 'passed', 'hash-bad': 'failed', human: 'blocked', 'json-spec': 'passed',
  });
  assert.equal(report.status, 'passed', 'optional failures and blocks do not fail the report');
  assert.match(report.checks.find((check) => check.id === 'cmd-bad').detail, /nope/);
  assert.match(report.checks.find((check) => check.id === 'human').detail, /requires a person/);
  assert.deepEqual(report.requiredIds, ['cmd-ok', 'cmd-code', 'file-ok', 'contains-ok', 'hash-ok', 'json-spec']);
  for (const check of report.checks) {
    assert.ok(Array.isArray(check.evidenceRefs));
    assert.equal(typeof check.name, 'string');
  }
});

test('a required failure fails the report, a required block yields blocked, and refusals are failures', async () => {
  const root = tempDir('checks-refuse-');
  const failed = await runChecks([
    { id: 'must', kind: 'file', required: true, path: 'nope.txt', description: 'missing' },
    { id: 'person', kind: 'human', required: true, description: 'person' },
  ], root, {});
  assert.equal(failed.status, 'failed', 'a failed required check outranks a blocked one');

  const blocked = await runChecks([
    { id: 'person', kind: 'human', required: true, description: 'person' },
  ], root, {});
  assert.equal(blocked.status, 'blocked');

  const refused = await runChecks([
    { id: 'escape', kind: 'file', required: true, path: '../outside.txt', description: 'escape' },
    { id: 'shell', kind: 'command', required: true, argv: ['powershell', '-c', 'whoami'], description: 'not allowlisted' },
    { id: 'python', kind: 'command', required: true, argv: ['python', '-c', 'print(1)'], description: 'reserved' },
    { id: 'unknown', kind: 'telepathy', required: true, description: 'unknown kind' },
    { id: 'allowed', kind: 'command', required: true, argv: [process.execPath, '-e', 'process.exit(0)'], description: 'allowlisted' },
  ], root, { allowedExecutables: new Set([process.execPath]) });
  const byId = Object.fromEntries(refused.checks.map((check) => [check.id, check]));
  assert.equal(byId.escape.status, 'failed');
  assert.match(byId.escape.detail, /escapes/);
  assert.equal(byId.shell.status, 'failed');
  assert.match(byId.shell.detail, /not allowlisted/);
  assert.equal(byId.python.status, 'failed');
  assert.equal(byId.unknown.status, 'failed');
  assert.equal(byId.allowed.status, 'passed');
  assert.equal(refused.status, 'failed');

  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  const aborted = await runChecks([{ id: 'x', kind: 'file', required: true, path: 'x', description: 'x' }], root, { signal: controller.signal });
  assert.equal(aborted.checks[0].status, 'not_run');
  assert.equal(aborted.status, 'failed');
});

// ---------------- adapters ----------------

function envelopeFor(overrides = {}) {
  const envelope = {
    schemaVersion: 1,
    workspaceId: 'ws-1',
    workItemId: 'wi-1',
    workItemRevision: 1,
    adapter: 'agent-host',
    workingDirectory: null,
    boundedPrompt: JSON.stringify({ nodeId: 'a', title: 'Node a', objective: 'Do a [[write:out/a.txt=done]]', definitionOfDone: ['a done'], hostKinds: [] }),
    allowedExecutables: ['codex'],
    verificationPlan: [],
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  envelope.actionHash = computeActionHash(envelope);
  return envelope;
}

test('agent-host adapter requires both allowlists, picks an available host, and never reports verified', async () => {
  const root = tempDir('ad-host-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(['codex']), hostCommands: { codex: fake('codex') }, searchPath: false });
  assert.deepEqual(adapters.names.sort(), ['cherry-export', 'cherry-verify', 'claude-cli', 'codex-cli', 'safe-command', 'scrapling-fetch', 'youtube-rss-watch'].sort(), 'legacy names are unchanged');
  assert.deepEqual(adapters.missionAdapterNames, ['agent-host', 'cherry-check']);
  assert.equal(adapters.has('mock-host'), false, 'the mock host is registered only with --allow-mock-host');

  const result = await adapters.run(envelopeFor({ workingDirectory: root }), { timeoutMs: 10_000 });
  assert.equal(result.status, 'completed');
  assert.equal(result.hostId, 'codex');
  assert.notEqual(result.status, 'verified');
  assert.equal(readFileSync(join(root, 'out', 'a.txt'), 'utf8'), 'done');
  assert.match(readFileSync(join(root, '.cherry', 'TASK.md'), 'utf8'), /Do a/);

  await assert.rejects(() => adapters.run(envelopeFor({ workingDirectory: root, allowedExecutables: [] })), /not allowed by the execution envelope/);
  const configOnly = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), hostCommands: { codex: fake('codex') }, searchPath: false });
  await assert.rejects(() => configOnly.run(envelopeFor({ workingDirectory: root })), /not in the runner config allowlist/);
  await assert.rejects(() => adapters.run(envelopeFor({ workingDirectory: tmpdir() })), /outside approved roots/);
  const preferClaude = envelopeFor({ workingDirectory: root, boundedPrompt: JSON.stringify({ nodeId: 'a', objective: 'x', hostKinds: ['claude-cli'] }), allowedExecutables: ['codex', 'claude'] });
  const claudeMissing = createAdapters({
    allowedRoots: [root],
    allowedExecutables: new Set(['codex', 'claude']),
    hostCommands: { codex: fake('codex'), claude: join(tmpdir(), 'definitely-missing-claude-binary') },
    searchPath: false,
  });
  await assert.rejects(() => claudeMissing.run(preferClaude), /no agent host is available/);
  const claudeOnly = await claudeMissing.run(envelopeFor({ workingDirectory: root, allowedExecutables: ['codex', 'claude'] }), { timeoutMs: 10_000 });
  assert.equal(claudeOnly.hostId, 'codex', 'an unavailable preferred host falls through to the next allowed host');
});

test('cherry-check adapter runs the envelope verification plan and mock-host is registered only when allowed', async () => {
  const root = tempDir('ad-check-');
  const adapters = createAdapters({ allowedRoots: [root], allowedExecutables: new Set(), allowMockHost: true, searchPath: false });
  assert.equal(adapters.has('mock-host'), true);
  assert.deepEqual(adapters.missionAdapterNames, ['agent-host', 'cherry-check', 'mock-host']);

  const mock = { attempts: [{ writeFiles: { 'out/c.txt': 'C' }, exitCode: 0 }] };
  const mocked = await adapters.run(envelopeFor({
    adapter: 'mock-host',
    workingDirectory: root,
    allowedExecutables: [],
    boundedPrompt: JSON.stringify({ nodeId: 'c', objective: 'write c', mock }),
  }), { timeoutMs: 5000 });
  assert.equal(mocked.status, 'completed');
  assert.equal(readFileSync(join(root, 'out', 'c.txt'), 'utf8'), 'C');

  const plan = [
    JSON.stringify({ id: 'c-file', kind: 'file', required: true, path: 'out/c.txt', description: 'c exists' }),
    JSON.stringify({ id: 'c-missing', kind: 'file', required: true, path: 'out/missing.txt', description: 'missing' }),
  ];
  const failed = await adapters.run(envelopeFor({ adapter: 'cherry-check', workingDirectory: root, allowedExecutables: [], verificationPlan: plan }), { timeoutMs: 5000 });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.report.status, 'failed');
  assert.deepEqual(failed.report.checks.map((check) => check.status), ['passed', 'failed']);
  const passed = await adapters.run(envelopeFor({ adapter: 'cherry-check', workingDirectory: root, allowedExecutables: [], verificationPlan: plan.slice(0, 1) }), { timeoutMs: 5000 });
  assert.equal(passed.status, 'completed');
  assert.equal(passed.report.status, 'passed');
  assert.notEqual(passed.status, 'verified');
});
