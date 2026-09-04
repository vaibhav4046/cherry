#!/usr/bin/env node
/**
 * Cherry submission audit — judge-readiness and release preflight checks.
 * Prints PASS/FAIL/WARN lines; exits non-zero only when a FAIL occurred.
 * Node built-ins only; run via `npm run audit:submission`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const CANONICAL_URL = 'https://cherry-wine.vercel.app';

let failures = 0;
let warnings = 0;

function pass(msg) { console.log(`PASS ${msg}`); }
function fail(msg) { failures += 1; console.log(`FAIL ${msg}`); }
function warn(msg) { warnings += 1; console.log(`WARN ${msg}`); }

function readText(relPath) {
  try {
    return readFileSync(join(ROOT, relPath), 'utf8');
  } catch {
    return null;
  }
}

function requireNonEmpty(relPath) {
  const text = readText(relPath);
  if (text !== null && text.trim().length > 0) {
    pass(`${relPath} exists and is non-empty`);
    return text;
  }
  fail(`${relPath} is missing or empty`);
  return '';
}

// 1. Canonical URL in README + Devpost kit
for (const relPath of ['README.md', 'docs/release/DEVPOST_SUBMISSION.md']) {
  const text = readText(relPath);
  if (text === null) fail(`${relPath} is missing (needed for canonical URL check)`);
  else if (text.includes(CANONICAL_URL)) pass(`${relPath} contains ${CANONICAL_URL}`);
  else fail(`${relPath} does not contain ${CANONICAL_URL}`);
}

// 2. LICENSE exists and mentions MIT
{
  const text = readText('LICENSE');
  if (text === null) fail('LICENSE file is missing');
  else if (/MIT/.test(text)) pass('LICENSE exists and mentions MIT');
  else fail('LICENSE exists but does not mention MIT');
}

// 3. README setup instructions
{
  const text = readText('README.md') ?? '';
  const hasInstall = /npm (ci|install)/.test(text);
  const hasRun = /npm run dev|npm run build/.test(text);
  if (hasInstall && hasRun) pass('README has setup instructions (install + dev/build)');
  else fail(`README setup instructions incomplete (install: ${hasInstall}, dev/build: ${hasRun})`);
}

// 4. Release docs exist and are non-empty
for (const name of [
  'DEVPOST_SUBMISSION.md',
  'DEMO_SCRIPT.md',
  'CHERRY_COMPATIBILITY_MATRIX.md',
  'CHERRY_RELEASE_EVIDENCE.md',
  'CODEX_SUBMISSION_CHECKLIST.md',
]) {
  requireNonEmpty(`docs/release/${name}`);
}
requireNonEmpty('docs/CODEX_AUTOMATION.md');

// 5. e2e-results.json records a run that actually happened and actually passed.
// Parsing alone is not evidence: a report where every test was skipped proves nothing.
{
  const text = readText('docs/release/e2e-results.json');
  if (text === null) fail('docs/release/e2e-results.json is missing');
  else {
    try {
      const parsed = JSON.parse(text);
      const stats = parsed?.stats ?? {};
      const expected = Number(stats.expected ?? 0);
      const unexpected = Number(stats.unexpected ?? 0);
      const skipped = Number(stats.skipped ?? 0);
      const flaky = Number(stats.flaky ?? 0);
      const summary = `expected: ${expected}, unexpected: ${unexpected}, skipped: ${skipped}, flaky: ${flaky}`;

      if (expected === 0) {
        fail(`docs/release/e2e-results.json records no tests that ran (${summary}) — it is not evidence of a passing suite`);
      } else if (unexpected > 0) {
        fail(`docs/release/e2e-results.json records ${unexpected} failing test(s) (${summary})`);
      } else if (skipped > expected) {
        fail(`docs/release/e2e-results.json skipped more tests than it ran (${summary})`);
      } else {
        pass(`docs/release/e2e-results.json records a real passing run (${summary})`);
      }
    } catch {
      fail('docs/release/e2e-results.json is not valid JSON');
    }
  }
}

// 6. sample-bundle.zip exists and is >1KB
{
  const relPath = 'docs/release/sample-bundle.zip';
  try {
    const size = statSync(join(ROOT, relPath)).size;
    if (size > 1024) pass(`${relPath} exists (${size} bytes)`);
    else fail(`${relPath} is suspiciously small (${size} bytes)`);
  } catch {
    fail(`${relPath} is missing`);
  }
}

// 7. Secret scan over tracked text surfaces
{
  const SECRET_RE = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  // Known dummy fixture: runner redaction tests deliberately emit this string.
  const ALLOWLISTED_FIXTURES = new Set(['sk-abcdefghijklmnop1234']);
  const SCAN_DIRS = ['src', 'scripts', 'docs', 'runner', 'schemas', 'e2e', 'tests', '.github'];
  const ROOT_FILES = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'package.json', 'index.html'];
  const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'screenshots', 'test-results', 'playwright-report', 'artifacts']);
  const TEXT_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.yaml', '.yml', '.svg']);
  const hits = [];

  function scanFile(full) {
    let content;
    try {
      content = readFileSync(full, 'utf8');
    } catch {
      return;
    }
    const match = SECRET_RE.exec(content);
    if (match && !ALLOWLISTED_FIXTURES.has(match[1])) hits.push(`${full}: ${match[1].slice(0, 12)}…`);
  }

  function scanDir(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) scanDir(full);
        continue;
      }
      if (TEXT_EXT.has(extname(entry.name).toLowerCase())) scanFile(full);
    }
  }

  for (const dir of SCAN_DIRS) {
    if (existsSync(join(ROOT, dir))) scanDir(join(ROOT, dir));
  }
  for (const file of ROOT_FILES) {
    if (existsSync(join(ROOT, file))) scanFile(join(ROOT, file));
  }
  if (hits.length === 0) pass('secret scan: no credential-shaped strings in tracked text files (redaction fixture allowlisted)');
  else for (const hit of hits) fail(`secret scan hit: ${hit}`);
}

// 8. Stale-claim scan over docs/release/*.md
{
  const releaseDir = join(ROOT, 'docs', 'release');
  const STALE_RE = /(live validated|fully offline)/i;
  let clean = true;
  for (const name of readdirSync(releaseDir)) {
    if (extname(name).toLowerCase() !== '.md') continue;
    const content = readFileSync(join(releaseDir, name), 'utf8');
    const match = STALE_RE.exec(content);
    if (match) {
      clean = false;
      warn(`stale claim "${match[1]}" in docs/release/${name}`);
    }
  }
  if (clean) pass('stale-claim scan: no "live validated" / "fully offline" in docs/release/*.md');
}

// 9. Demo route availability
{
  const appText = readText('src/app/App.tsx') ?? '';
  const landingText = readText('src/pages/Landing.tsx') ?? '';
  const hasRoute = appText.includes('"/studio"');
  const hasDemoLink = landingText.includes('/studio?demo=1');
  if (hasRoute && hasDemoLink) pass('demo route: /studio route exists and Landing links to /studio?demo=1');
  else fail(`demo route check failed (route: ${hasRoute}, landing link: ${hasDemoLink})`);
}

// 10. WebMCP implementation and judge-journey contract
{
  const manager = requireNonEmpty('src/cherry/webmcp/registration-manager.ts');
  const tools = requireNonEmpty('src/cherry/webmcp/tool-definitions.ts');
  const fullJourney = requireNonEmpty('e2e/cherry/webmcp-full-journey.spec.ts');
  const showcaseJourney = requireNonEmpty('e2e/cherry/showcase-host.spec.ts');
  const requiredToolNames = [
    'read_cherry_context',
    'list_cherry_capabilities',
    'request_checkpoint_approval',
    'get_approval_status',
  ];
  const registrationPresent = /registerTool|modelContext/.test(manager);
  const namesPresent = requiredToolNames.every((name) => tools.includes(name));
  const fullLoopPresent = /learn -> derive -> human approve -> execute -> verify -> repair -> export/.test(fullJourney)
    && fullJourney.includes("getByTestId('approve-skill')");
  const showcaseHandoffPresent = showcaseJourney.includes("getByTestId('approve-skill')")
    && (showcaseJourney.includes('approvalUrl') || /waitForURL\([^\n]*approval=/.test(showcaseJourney));

  if (registrationPresent) pass('WebMCP registration manager contains the host registration path');
  else fail('WebMCP registration manager no longer contains a host registration path');
  if (namesPresent) pass('critical WebMCP context and approval tools are present');
  else fail('one or more critical WebMCP context/approval tools are missing');
  if (fullLoopPresent) pass('full registered-closure journey retains the human approval boundary and complete loop');
  else fail('full registered-closure journey no longer proves the complete human-gated loop');
  if (showcaseHandoffPresent) pass('showcase host journey follows the real approval deep link');
  else fail('showcase host journey does not follow the real approval deep link');
}

// 11. Hourly monitor and isolated Codex repair contract
{
  const workflow = requireNonEmpty('.github/workflows/hourly-maintenance.yml');
  const prompt = requireNonEmpty('.github/codex/prompts/hourly-repair.md');
  const health = requireNonEmpty('scripts/hourly-health.mjs');
  const healthTest = requireNonEmpty('scripts/hourly-health.test.mjs');
  const proposalValidator = requireNonEmpty('scripts/apply-codex-proposal.mjs');
  const proposalValidatorTest = requireNonEmpty('scripts/apply-codex-proposal.test.mjs');
  const packageText = readText('package.json') ?? '';

  const proposeStart = workflow.indexOf('\n  codex-propose:');
  const verifyStart = workflow.indexOf('\n  repair-verify:');
  const publishStart = workflow.indexOf('\n  repair-publish:');
  const proposeBlock = proposeStart >= 0 && verifyStart > proposeStart ? workflow.slice(proposeStart, verifyStart) : '';
  const verifyBlock = verifyStart >= 0 && publishStart > verifyStart ? workflow.slice(verifyStart, publishStart) : '';
  const publishBlock = publishStart >= 0 ? workflow.slice(publishStart) : '';
  const actionPosition = proposeBlock.indexOf('uses: openai/codex-action@v1');
  const laterStepPosition = actionPosition >= 0
    ? proposeBlock.slice(actionPosition).search(/\n      - (?:name:|uses:)/)
    : 0;

  const checks = {
    hourlySchedule: /cron:\s*['"]17 \* \* \* \*['"]/.test(workflow),
    codexAction: actionPosition >= 0,
    noAutoMerge: !/gh pr merge|mergePullRequest|enablePullRequestAutoMerge/.test(workflow),
    noDeploy: !/vercel deploy|deploy --prod/.test(workflow),
    actionsWriteOnlyAtPublish: !proposeBlock.includes('actions: write')
      && !verifyBlock.includes('actions: write')
      && publishBlock.includes('actions: write'),
    staticPrompt: proposeBlock.includes('prompt-file: .github/codex/prompts/hourly-repair.md'),
    schemaConstrained: proposeBlock.includes('output-schema: |')
      && proposeBlock.includes('"enum": ["repair", "no_change"]')
      && proposeBlock.includes('"maxLength": 200000'),
    actionIsLast: actionPosition >= 0 && laterStepPosition < 0,
    isolatedJobs: proposeStart >= 0 && verifyStart > proposeStart && publishStart > verifyStart,
    credentialFreeCheckouts: [proposeBlock, verifyBlock, publishBlock]
      .every((block) => block.includes('persist-credentials: false')),
    remoteRemovedBeforeAgent: proposeBlock.includes('git remote remove origin'),
    readOnlyProposalAndVerify: [proposeBlock, verifyBlock]
      .every((block) => /permissions:\n\s+contents: read/.test(block)),
    noGithubTokenBeforePublish: !proposeBlock.includes('GH_TOKEN:') && !verifyBlock.includes('GH_TOKEN:'),
    hashMatchedPublication: publishBlock.includes('EXPECTED_PATCH_SHA256:')
      && publishBlock.includes('EXPECTED_STAGED_DIFF_SHA256:'),
    publishDoesNotExecuteCandidate: !/^\s+npm (?:ci|run)\b/m.test(publishBlock),
    explicitVerificationDispatch: publishBlock.includes('gh workflow run verify.yml --ref'),
    liveHealthAlways: /- name: Public-route health\n\s+if: always\(\)/.test(workflow),
    healthScript: packageText.includes('"health:hourly"') && health.includes('DEFAULT_ROUTES'),
    healthTest: healthTest.includes("node:test") && healthTest.includes("'/showcase'") && healthTest.includes("'/connect'"),
    validatorInGate: packageText.includes('scripts/apply-codex-proposal.test.mjs')
      && proposalValidator.includes('MAX_PATCH_BYTES')
      && proposalValidator.includes('EXPECTED_STAGED_DIFF_SHA256')
      && proposalValidatorTest.includes('protected control-plane'),
    protectedControlPlane: prompt.includes('Protected control plane')
      && prompt.includes('`.github/**`')
      && prompt.includes('package manifests or lockfiles')
      && prompt.includes('scripts/apply-codex-proposal.mjs'),
    repairBoundary: prompt.includes('Do not auto-approve, merge, deploy'),
  };
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (failedChecks.length === 0) pass('hourly monitoring and isolated Codex repair contract is complete');
  else fail(`hourly monitoring contract failed: ${failedChecks.join(', ')}`);
}

// 12. Active ownership policy must not assign the repository to a retired session.
// Historical Git commits and the append-only STATUS ledger are intentionally excluded.
{
  const files = [
    'README.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'index.html',
    'docs/codex-takeover/00_MASTER_PROMPT.md',
    'docs/codex-takeover/01_STATE_OF_CHERRY.md',
    'docs/codex-takeover/02_TICKETS.md',
    'docs/codex-takeover/03_DESIGN_DIRECTIVE.md',
    'docs/codex-takeover/04_COPY_GUIDE.md',
    'docs/codex-takeover/05_GUARDRAILS.md',
    'docs/codex-takeover/06_OPERATING_MODEL.md',
  ];
  const markers = [
    /Co-Authored-By:\s*Claude/i,
    /Claude-Session:/i,
    /Owner:\s*Claude\b/i,
    /Claude\s+deploys\b/i,
    /Claude['’]s\s+lane/i,
    /\*\*Claude\*\*\s*\([^)]*(architect|release)/i,
  ];
  const hits = [];
  for (const file of files) {
    const text = readText(file);
    if (text === null) {
      hits.push(`${file}: missing`);
      continue;
    }
    for (const marker of markers) {
      const match = marker.exec(text);
      if (match) hits.push(`${file}: ${match[0]}`);
    }
  }
  if (hits.length === 0) pass('active ownership policy is Codex-led and contains no stale authorship marker');
  else for (const hit of hits) fail(`active ownership attribution: ${hit}`);
}

console.log(`\naudit-submission: ${failures} FAIL, ${warnings} WARN`);
process.exit(failures > 0 ? 1 : 0);
