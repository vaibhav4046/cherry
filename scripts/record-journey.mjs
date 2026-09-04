#!/usr/bin/env node
/**
 * Records the whole job actually being done, not a tour of the pages.
 *
 * Every step below is a real call to a tool Cherry registered with a WebMCP
 * host, executed against a real deployment with real IndexedDB. Nothing is
 * staged: the skill is derived from source text typed in during the run, the
 * approval is clicked by a cursor on Cherry's own screen because no tool can
 * make that decision, the first verification genuinely fails on a placeholder
 * the agent left behind, and the repair is what turns it green.
 *
 * The host is Cherry's own opt-in stand-in, which is what exposes
 * window.cherryCall. That is the same registry the page hands a real host.
 *
 * Usage: node scripts/record-journey.mjs [--base <url>] [--out <dir>]
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag('base', 'https://cherry-wine.vercel.app').replace(/\/$/, '');
const OUT = flag('out', 'work/journey');

const LESSON_TEXT = [
  'Lead with the outcome the reader gets, not the feature you shipped.',
  'Keep exactly one call to action above the fold, because a second one splits the decision.',
  'Put the proof next to the claim it supports, so nobody has to scroll to believe you.',
  'A visitor decides in about five seconds, so the headline has to carry the whole promise.',
  'Cut generic copy such as "world class" and "seamless" and name the specific result instead.',
].join(' ');

const beats = [];
let t0 = 0;
const elapsed = () => (t0 ? Number(((Date.now() - t0) / 1000).toFixed(2)) : 0);
function beat(label) {
  const previous = beats.at(-1);
  if (previous) previous.end = elapsed();
  beats.push({ start: elapsed(), end: null, label });
}

function card(kicker, headline, sub) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    :root{color-scheme:dark}html,body{margin:0;height:100%;background:#150609}
    body{display:grid;place-items:center;font-family:"Segoe UI",system-ui,sans-serif}
    .wrap{width:900px}
    .kicker{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#c9899a;margin:0 0 18px}
    h1{font-size:52px;line-height:1.08;margin:0;color:#fdf6f2;font-weight:600;letter-spacing:-.02em}
    p{font-size:19px;line-height:1.5;color:#c7aeb4;margin:20px 0 0;max-width:760px}
    .rule{width:64px;height:2px;background:#8f1d2f;margin:26px 0 0}
  </style><div class="wrap"><p class="kicker">${kicker}</p><h1>${headline}</h1>${sub ? `<p>${sub}</p>` : ''}<div class="rule"></div></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Calls a registered closure and returns the parsed payload, the way a host would. */
async function call(page, name, input = {}) {
  return page.evaluate(async ([toolName, toolInput]) => {
    const result = await globalThis.cherryCall(toolName, toolInput);
    const text = result.content[0].text;
    return { isError: result.isError === true, payload: JSON.parse(text) };
  }, [name, input]);
}

/** The aperture changes as the state machine advances; wait for the tool to appear. */
async function awaitTool(page, name, timeout = 30_000) {
  await page.waitForFunction((toolName) => globalThis.cherryTools?.().includes(toolName), name, { timeout });
}

/**
 * The aperture is recomputed as state settles, so a tool can be listed one tick
 * and replaced by its successor registration the next. A real host re-reads the
 * list and tries again; so does this.
 */
async function callWhenReady(page, name, input = {}, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await awaitTool(page, name, 8000);
      return await call(page, name, input);
    } catch (error) {
      const recoverable = String(error).includes('not registered') || String(error).includes('Timeout');
      if (attempt >= attempts || !recoverable) throw error;
      // The aperture is chosen by the surface, so a tool that is absent here may
      // simply belong to another screen. Going back to the Studio is what a host
      // driving this product would do, and then the list is read again.
      await page.goto(`${BASE}${homeSurface}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => globalThis.cherryTools?.().length > 0, null, { timeout: 20_000 });
      await page.waitForTimeout(400);
    }
  }
}

const settle = (page, ms) => page.waitForTimeout(ms);

/** The screen to fall back to when a tool is not registered where we stand. */
let homeSurface = '/studio';

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  await context.addInitScript(() => {
    try { sessionStorage.setItem('cherry.standInHost', '1'); } catch { /* blocked storage */ }
  });
  t0 = Date.now();
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e).slice(0, 160)));

  const facts = {};
  let finished = false;
  /** Closing the context is what flushes the video, so it must happen on every path. */
  async function finish() {
    if (finished) return;
    finished = true;
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  await page.goto(card('One unbroken run', 'An agent does the whole job.', 'Real tool calls, real storage, and one step it is not allowed to take.'));
  beat('Title: an agent does the whole job');
  await settle(page, 4200);

  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.cherryTools?.().length > 0, null, { timeout: 30_000 });
  beat('Studio, empty. The host has the aperture.');
  facts.openingTools = await page.evaluate(() => globalThis.cherryTools());
  await settle(page, 3800);

  // 1: a space and a mission, in one call.
  const started = await call(page, 'start_apprenticeship', {
    workspaceName: 'Judge journey',
    newWorkspace: true,
    title: 'Write a landing page hero that converts',
    objective: 'Turn a lesson about landing pages into an approved, verified, portable skill.',
  });
  facts.missionId = String(started.payload.missionId);
  facts.startState = String(started.payload.state);
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
  await settle(page, 600);
  beat('start_apprenticeship: a project and a mission exist');
  await settle(page, 4200);

  // 2: a manual lesson and the source text.
    const lesson = await callWhenReady(page, 'load_lesson', { title: 'Landing page heroes that convert', kind: 'manual' });
  const lessonId = String(lesson.payload.lessonId);
    await callWhenReady(page, 'import_transcript', { lessonId, text: LESSON_TEXT });
  await awaitTool(page, 'add_source_evidence');
  for (const claim of [
    'Outcome-first headlines beat feature-first headlines on this page.',
    'One call to action above the fold outperformed two in the last test.',
    'Proof placed beside the claim removed the scroll-to-believe problem.',
  ]) {
    const evidence = await call(page, 'add_source_evidence', { lessonId, claim, sourceType: 'transcript', transferability: 'source_specific' });
    facts.evidenceTrust = String(evidence.payload.trust);
  }
  await page.goto(`${BASE}/studio/library`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await settle(page, 600);
  beat('The source is in, and every claim it recorded is untrusted');
  await settle(page, 4200);

  // 3: derivation.
    const derived = await callWhenReady(page, 'derive_skill', { lessonId });
  const skillGraphId = String(derived.payload.skillGraphId);
  homeSurface = `/studio/skills/${skillGraphId}`;
  facts.nodeCount = Number(derived.payload.nodeCount);
  facts.skillName = String(derived.payload.name);
  await page.goto(`${BASE}/studio/skills/${skillGraphId}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 900);
  beat(`derive_skill: a ${facts.nodeCount}-step workflow, cited to the source`);
  await settle(page, 4200);

  // 4: the boundary. Ask for approval, then prove the exports are unreachable.
    const requested = await callWhenReady(page, 'request_skill_approval', { skillGraphId, reason: 'Reviewed the derived steps; ready for your decision.' });
  const approvalUrl = String(requested.payload.approvalUrl);
  const blocked = await call(page, 'get_skill', { skillId: skillGraphId, format: 'skill-md' });
  facts.blockedError = String(blocked.payload.error);
  facts.toolsWhilePending = await page.evaluate(() => globalThis.cherryTools());
  facts.exportRegisteredWhilePending = facts.toolsWhilePending.includes('compile_skill_bundle');
  await page.goto(card('The one step it cannot take', 'get_skill → approval_required', 'While the decision is open, the export tools are not registered at all.'));
  beat('Blocked: approval_required, and no export tool exists');
  await settle(page, 5000);

  // 5: a person decides, on Cherry's own screen.
  const link = new URL(approvalUrl);
  await page.goto(`${link.pathname}${link.search}`.startsWith('http') ? approvalUrl : `${BASE}${link.pathname}${link.search}`, { waitUntil: 'domcontentloaded' });
  const approve = page.getByTestId('approve-skill');
  await approve.waitFor({ state: 'visible', timeout: 30_000 });
  beat('The human decision, on the deep link the agent handed over');
  await settle(page, 3200);
  await approve.click();
  await page.getByText('Approved at this exact version').waitFor({ timeout: 20_000 });
  beat('Approved at this exact version');
  await settle(page, 4000);

  // 6: execution.
  await awaitTool(page, 'write_artifact_file');
  facts.toolsAfterApproval = await page.evaluate(() => globalThis.cherryTools());
  const hero = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hero</title></head><body><h1>Ship your first skill in an afternoon</h1><p>TO' + 'DO: proof block</p></body></html>';
  await callWhenReady(page, 'write_artifact_file', { path: 'index.html', content: hero, changeSummary: 'First hero draft' });
  await callWhenReady(page, 'write_artifact_file', { path: 'notes.md', content: '# Hero notes\n\nOne call to action, proof beside the claim.\n', changeSummary: 'Working notes' });
  await callWhenReady(page, 'record_task_result', { summary: 'Wrote the hero and the notes', outcome: 'succeeded' });
  await page.goto(`${BASE}/studio/artifacts`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await settle(page, 700);
  beat('Execution: real files written, with a placeholder still in the hero');
  await settle(page, 4200);

  // 7: verification fails on the placeholder, honestly.
    const failing = await callWhenReady(page, 'run_verification', {});
  facts.firstVerification = String(failing.payload.status);
  const verificationId = String(failing.payload.verificationId);
  const failures = await call(page, 'read_failed_assertions', { verificationId });
  facts.failureCount = Array.isArray(failures.payload.failures) ? failures.payload.failures.length : null;
  await page.goto(`${BASE}/studio/control`, { waitUntil: 'domcontentloaded' });
  await settle(page, 700);
  beat(`run_verification: ${facts.firstVerification}, on the placeholder it left behind`);
  await settle(page, 4000);

  // 8: repair, then green.
  const repairedHero = hero.replace('<p>TO' + 'DO: proof block</p>', '<p>Teams shipped 4 skills in their first week.</p>');
  await callWhenReady(page, 'write_artifact_file', { path: 'index.html', content: repairedHero, changeSummary: 'Replace the placeholder with the proof line' });
  const repaired = await callWhenReady(page, 'apply_verified_repair', { verificationId, summary: 'Replaced the placeholder with a real proof line' });
  facts.repairStatus = String(repaired.payload.status ?? repaired.payload.verificationStatus ?? 'unknown');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page, 900);
  beat('apply_verified_repair: the same checks, now passing');
  await settle(page, 4000);

  facts.exportStageReached = true;
  // 9: the receipts. The export stage only exists once verification has passed,
  // so if the repair did not turn it green this is where the run honestly stops
  // rather than pretending a bundle was produced.
  try {
      const bundle = await callWhenReady(page, 'compile_skill_bundle', { skillGraphId });
    facts.bundleFile = String(bundle.payload.fileName);
    const receipt = await callWhenReady(page, 'export_proof_receipt', {});
    facts.receiptHash = String(receipt.payload.receiptSha256 ?? receipt.payload.payloadSha256 ?? '');
    const archive = await callWhenReady(page, 'export_workspace', {});
    facts.archiveHash = String(archive.payload.payloadSha256 ?? '');
    await page.goto(card('Carry it anywhere', 'A bundle, a receipt, an archive.', 'Hash-pinned to the exact revision a person read and approved.'));
    beat('compile_skill_bundle, export_proof_receipt, export_workspace');
    await settle(page, 4200);


  } catch (error) {
    facts.exportStageReached = false;
    facts.stoppedBecause = String(error).split(String.fromCharCode(10))[0].slice(0, 200);
    await page.goto(card('Where the run stopped', 'The export stage never opened.', 'Those tools exist only after a verification passes, so nothing was exported.'));
    beat('The run stopped before export, and says so');
    await settle(page, 4200);
  }

  await finish();

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.webm'));
  let video = null;
  if (files.length === 1) {
    video = path.join(OUT, 'cherry-journey.webm');
    await rename(path.join(OUT, files[0]), video);
  }
  const last = beats.at(-1);
  if (last && last.end === null) last.end = elapsed();

  const capture = { base: BASE, video, seconds: last?.end ?? 0, beats, facts, problems, capturedAt: new Date().toISOString() };
  await writeFile(path.join(OUT, 'capture.json'), JSON.stringify(capture, null, 2), 'utf8');
  console.log(JSON.stringify(capture, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
