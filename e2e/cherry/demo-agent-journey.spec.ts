import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * The product film: an agent works, a person decides, and the page shows both.
 *
 * Every frame is the real app doing real work through the registered WebMCP
 * closures against real IndexedDB. Nothing is mocked except the host itself,
 * which is the same stand-in the app ships for auditing: it stores the
 * registrations Cherry offers, honours the AbortSignal Cherry passes when a
 * tool is retired, and forwards calls to Cherry's own execute function.
 *
 * The approval is a real pointer click on Cherry's own approve control. There
 * is no shortcut past it, on camera or off.
 *
 * Opt-in: `npm run record:film`. Ignored by the default Playwright config.
 */

const BEAT = 800;

/**
 * Caption timings have to come from the take, not from a guess made afterwards.
 * Every chapter records the second it actually started, so the subtitle track
 * and the picture cannot drift.
 */
const CAPTIONS_PATH = 'docs/release/demo/film-captions.json';
const chapters: Array<{ at: number; kicker: string; headline: string }> = [];
let filmStart = 0;

function chapter(kicker: string, headline: string) {
  chapters.push({ at: Number(((Date.now() - filmStart) / 1000).toFixed(2)), kicker, headline });
}

async function beat(page: Page, times = 1) {
  await page.waitForTimeout(BEAT * times);
}

interface FilmWindow {
  __host: { tools: Map<string, { execute: (input: unknown) => Promise<unknown> }> };
}

async function installHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map();
    (window as unknown as { __host: unknown }).__host = { tools };
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        });
      },
    };
  });
}

async function call(page: Page, name: string, input: unknown = {}): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ([toolName, toolInput]) => {
      const tool = (window as unknown as FilmWindow).__host.tools.get(toolName as string);
      if (!tool) throw new Error(`tool not registered: ${toolName as string}`);
      const result = (await tool.execute(toolInput)) as { content: Array<{ text: string }> };
      return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    },
    [name, input] as const,
  );
}

async function waitForTool(page: Page, name: string) {
  await expect
    .poll(() => page.evaluate(() => [...(window as unknown as FilmWindow).__host.tools.keys()]), { timeout: 20_000 })
    .toContain(name);
}

test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: 'on', size: { width: 1440, height: 900 } },
  deviceScaleFactor: 2,
});

const LESSON = [
  'Lead with the outcome the reader gets, not the feature you shipped.',
  'Keep exactly one call to action above the fold, because a second one splits the decision.',
  'Put the proof next to the claim it supports, so nobody has to scroll to believe you.',
  'A visitor decides in about five seconds, so the headline has to carry the whole promise.',
  'Cut generic copy such as "world class" and "seamless" and name the specific result instead.',
].join(' ');

test('films an agent learning a skill, a person approving it, and the work being proved', async ({ page }) => {
  test.setTimeout(300_000);
  await installHost(page);

  filmStart = Date.now();
  chapter('The aperture', 'A page that hands an agent its tools');

  // 1. Agent View: the tools are registered and nothing has called one yet.
  await page.goto('/studio/agent');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await beat(page, 3);

  await call(page, 'introduce_agent', { name: 'ChatGPT — landing page' });
  await beat(page, 2);

  // 2. A space and a project, created by the agent.
  chapter('start_apprenticeship', 'A space and a project, in one call');
  const started = await call(page, 'start_apprenticeship', {
    workspaceName: 'Launch page',
    newWorkspace: true,
    title: 'Write a landing page hero that converts',
    objective: 'Turn a lesson about landing pages into an approved, verified, portable skill.',
  });
  await beat(page, 2);

  // 3. The source the person chose, and the claims the agent recorded.
  chapter('add_source_evidence', 'Every claim it records starts untrusted');
  await waitForTool(page, 'load_lesson');
  const lesson = await call(page, 'load_lesson', { title: 'Landing page heroes that convert', kind: 'manual' });
  const lessonId = String(lesson.lessonId);
  await beat(page);

  await waitForTool(page, 'import_transcript');
  await call(page, 'import_transcript', { lessonId, text: LESSON });
  await beat(page, 2);

  await waitForTool(page, 'add_source_evidence');
  for (const claim of [
    'Outcome-first headlines beat feature-first headlines on this page.',
    'One call to action above the fold outperformed two in the last test.',
  ]) {
    await call(page, 'add_source_evidence', { lessonId, claim, sourceType: 'transcript', transferability: 'source_specific' });
    await beat(page);
  }

  // 4. Derivation: five ideas become five steps.
  chapter('derive_skill', 'Five sentences become five cited steps');
  await waitForTool(page, 'derive_skill');
  const derived = await call(page, 'derive_skill', { lessonId });
  const skillGraphId = String(derived.skillGraphId);
  expect(Number(derived.nodeCount)).toBeGreaterThan(1);
  await beat(page, 2);

  // 5. The agent asks, and Cherry puts the decision on screen by itself.
  chapter('The boundary', 'The agent asks. It cannot decide.');
  await waitForTool(page, 'request_skill_approval');
  const requested = await call(page, 'request_skill_approval', {
    skillGraphId,
    reason: 'Five principles derived from the landing page lesson. Ready for your decision.',
  });
  await expect(page.getByTestId('pending-approval-bar')).toBeVisible();
  await beat(page, 3);

  // The agent cannot approve, and it can prove that it is waiting.
  const pending = await call(page, 'get_approval_status', { approvalId: String(requested.approvalId) });
  expect(pending.status).toBe('pending');
  await beat(page, 2);

  // 6. The decision. A person, on Cherry's own screen.
  chapter("Human only", "A person decides, on the product's own screen");
  const approve = page.getByTestId('approve-skill');
  await expect(approve).toBeVisible({ timeout: 20_000 });
  await approve.hover();
  await beat(page);
  await approve.click();
  await expect(page.getByText('Approved at this exact version')).toBeVisible();
  await beat(page, 3);

  // 7. The aperture moved, so the agent can work.
  chapter('Execution', 'Approved at this exact revision, so the tools change');
  await waitForTool(page, 'write_artifact_file');
  await page.goto('/studio/agent');
  await beat(page, 3);

  const hero = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hero</title></head><body><h1>Ship your first verified skill this afternoon</h1><p>TO' + 'DO: proof block</p></body></html>';
  await call(page, 'write_artifact_file', { path: 'index.html', content: hero, changeSummary: 'First hero draft' });
  await beat(page);
  await call(page, 'write_artifact_file', { path: 'notes.md', content: '# Hero notes\n\nOne call to action, proof beside the claim.\n', changeSummary: 'Working notes' });
  await beat(page);
  await call(page, 'record_task_result', { summary: 'Wrote the hero and the notes', outcome: 'succeeded' });
  await beat(page, 2);

  // 8. Verification fails for a real reason, and says which one.
  chapter('run_verification', 'It failed, on the placeholder the agent left behind');
  await waitForTool(page, 'run_verification');
  const failed = await call(page, 'run_verification', {});
  expect(failed.status).toBe('failed');
  await beat(page, 3);

  await waitForTool(page, 'read_failed_assertions');
  const failures = await call(page, 'read_failed_assertions', { verificationId: String(failed.verificationId) });
  await beat(page, 3);

  // 9. A bounded repair, and a re-run that has to pass.
  chapter('apply_verified_repair', 'The same checks, now passing');
  const fixed = hero.replace(/<p>TO.?DO: proof block<\/p>/, '<p>Cherry users shipped a verified skill in one sitting.</p>');
  await call(page, 'write_artifact_file', { path: 'index.html', content: fixed, changeSummary: 'Replace the placeholder with the real proof line' });
  await beat(page);
  const repaired = await call(page, 'apply_verified_repair', {
    verificationId: String(failed.verificationId),
    failedAssertionId: String((failures.failed as Array<{ id: string }>)[0]!.id),
    repairSummary: 'Replaced the placeholder paragraph with the real proof line.',
  });
  expect(repaired.status).toBe('passed');
  await beat(page, 3);

  // 10. The agent leaves with something it can check itself.
  chapter('Carry it anywhere', 'A bundle, a receipt, an archive, each with a hash');
  await waitForTool(page, 'export_proof_receipt');
  await call(page, 'export_proof_receipt', {});
  await beat(page, 2);
  await call(page, 'compile_skill_bundle', { skillGraphId });
  await beat(page, 2);

  // 11. Close on the skill the person approved.
  await page.goto(`/studio/skills/${skillGraphId}`);
  await expect(page.getByText('approved · r2')).toBeVisible();
  await beat(page, 4);

  chapter('Approved', 'The skill a person signed off, pinned to r2');
  expect(String(started.workspaceName)).toBe('Launch page');

  await mkdir(dirname(CAPTIONS_PATH), { recursive: true });
  await writeFile(CAPTIONS_PATH, `${JSON.stringify(chapters, null, 2)}
`, 'utf8');
});
