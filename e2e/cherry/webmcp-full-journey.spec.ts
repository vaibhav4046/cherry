import { expect, test, type Page } from '@playwright/test';

/**
 * The whole journey a visiting agent actually has to complete, driven only
 * through the closures Cherry registered with a WebMCP host, against the real
 * built app and real IndexedDB.
 *
 * learn -> derive -> human approve -> execute -> verify -> repair -> export.
 *
 * The one step the agent cannot perform is the approval. This test makes the
 * decision the way a person does: it follows the deep link the tool returned
 * and clicks the approve control on Cherry's own screen. There is no test-only
 * approval path, because shipping one would be shipping the bypass.
 */

/** Declared locally: another spec declares its own shape on the same global. */
interface MockHostWindow {
  __host: {
    tools: Map<string, { execute: (input: unknown) => Promise<unknown> }>;
    registrations: number;
  };
}

const GLOBALS = ['read_cherry_context', 'list_cherry_capabilities', 'get_cherry_status', 'introduce_agent', 'list_skills', 'recommend_skills', 'get_skill'];

/** Five distinct claims, so derivation has something real to segment. */
const LESSON_TEXT = [
  'Lead with the outcome the reader gets, not the feature you shipped.',
  'Keep exactly one call to action above the fold, because a second one splits the decision.',
  'Put the proof next to the claim it supports, so nobody has to scroll to believe you.',
  'A visitor decides in about five seconds, so the headline has to carry the whole promise.',
  'Cut generic copy such as "world class" and "seamless" and name the specific result instead.',
].join(' ');

async function installMockHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map();
    const host = { tools, registrations: 0 };
    (window as unknown as { __host: unknown }).__host = host;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown> }, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        host.registrations += 1;
        options?.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        });
      },
    };
  });
}

async function hostTools(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window as unknown as MockHostWindow).__host.tools.keys()].sort());
}

interface ToolCall {
  isError: boolean;
  text: string;
  payload: Record<string, unknown>;
}

async function callTool(page: Page, name: string, input: unknown): Promise<ToolCall> {
  return page.evaluate(
    async ([toolName, toolInput]) => {
      const tool = (window as unknown as MockHostWindow).__host.tools.get(toolName as string);
      if (!tool) throw new Error(`tool not registered: ${toolName as string}`);
      const result = (await tool.execute(toolInput)) as { isError?: boolean; content: Array<{ text: string }> };
      const text = result.content[0]!.text;
      return { isError: result.isError === true, text, payload: JSON.parse(text) as Record<string, unknown> };
    },
    [name, input] as const,
  );
}

/** SHA-256 in the page, so a returned hash is checked against real bytes. */
async function sha256InPage(page: Page, value: string): Promise<string> {
  return page.evaluate(async (text) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }, value);
}

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * The aperture is re-selected after a mutating call returns, so a tool that
 * belongs to the next phase becomes live a beat after the call that unlocked
 * it. A real host re-lists tools between calls; this waits for the same thing.
 */
async function awaitTool(page: Page, name: string): Promise<void> {
  await expect.poll(() => hostTools(page), { timeout: 20_000 }).toContain(name);
}

test.describe('WebMCP end-to-end journey', () => {
  test('an agent learns, derives, waits for a person, then executes, verifies, repairs and exports', async ({ page }) => {
    test.setTimeout(180_000);
    await installMockHost(page);
    await page.goto('/studio');
    await expect.poll(() => hostTools(page)).toEqual(expect.arrayContaining(GLOBALS));

    // 1 and 2: a space and a mission, in one call, explicitly a new space.
    const started = await callTool(page, 'start_apprenticeship', {
      workspaceName: 'Judge journey',
      newWorkspace: true,
      title: 'Write a landing page hero that converts',
      objective: 'Turn a lesson about landing pages into an approved, verified, portable skill.',
    });
    expect(started.isError).toBe(false);
    expect(started.payload.workspaceCreated).toBe(true);
    expect(started.payload.workspaceName).toBe('Judge journey');
    expect(started.payload.state).toBe('DRAFT');
    const missionId = String(started.payload.missionId);

    // 3: a manual lesson. No source is fetched and nothing is downloaded.
    await awaitTool(page, 'load_lesson');
    const lesson = await callTool(page, 'load_lesson', { title: 'Landing page heroes that convert', kind: 'manual' });
    expect(lesson.isError).toBe(false);
    const lessonId = String(lesson.payload.lessonId);
    await awaitTool(page, 'import_transcript');

    // 4: multi-sentence source text, typed by the user in the transcript.
    const imported = await callTool(page, 'import_transcript', { lessonId, text: LESSON_TEXT });
    expect(imported.isError).toBe(false);

    // 5: several evidence records against the same lesson.
    await awaitTool(page, 'add_source_evidence');
    const claims = [
      'Outcome-first headlines beat feature-first headlines on this page.',
      'One call to action above the fold outperformed two in the last test.',
      'Proof placed beside the claim removed the scroll-to-believe problem.',
    ];
    for (const claim of claims) {
      const evidence = await callTool(page, 'add_source_evidence', {
        lessonId,
        claim,
        sourceType: 'transcript',
        transferability: 'source_specific',
      });
      expect(evidence.isError, claim).toBe(false);
      // An agent may record evidence; it may never raise its trust.
      expect(evidence.payload.trust, claim).toBe('untrusted');
    }

    // 6: derivation produces a real workflow, not a single "review this" node.
    await awaitTool(page, 'derive_skill');
    const derived = await callTool(page, 'derive_skill', { lessonId });
    expect(derived.isError).toBe(false);
    const skillGraphId = String(derived.payload.skillGraphId);
    expect(Number(derived.payload.nodeCount)).toBeGreaterThan(1);
    expect(String(derived.payload.name).toLowerCase()).not.toContain('review the lesson material');

    // 7: approval is requested for the exact revision, with a hash and a link.
    await awaitTool(page, 'request_skill_approval');
    const graph = await callTool(page, 'get_skill', { skillId: skillGraphId });
    const revision = Number(graph.payload.revision);
    const requested = await callTool(page, 'request_skill_approval', { skillGraphId, reason: 'Reviewed the derived steps; ready for your decision.' });
    expect(requested.isError).toBe(false);
    expect(requested.payload.status).toBe('pending');
    expect(Number(requested.payload.revision)).toBe(revision);
    const approvalId = String(requested.payload.approvalId);
    const approvalUrl = String(requested.payload.approvalUrl);
    expect(approvalUrl).toContain(skillGraphId);

    // The read-only status tool reports the same decision, unstale, plus the link.
    const pendingStatus = await callTool(page, 'get_approval_status', { approvalId });
    expect(pendingStatus.payload.status).toBe('pending');
    expect(pendingStatus.payload.objectRevision).toBe(revision);
    expect(String(pendingStatus.payload.contentHash)).toMatch(HEX_64);
    expect(pendingStatus.payload.stale).toBe(false);

    // 8: nothing downstream is reachable while the decision is outstanding.
    for (const format of ['skill-md', 'agents-md'] as const) {
      const blocked = await callTool(page, 'get_skill', { skillId: skillGraphId, format });
      expect(blocked.isError, format).toBe(true);
      expect(blocked.payload.error, format).toBe('approval_required');
    }
    const live = await hostTools(page);
    expect(live).not.toContain('write_artifact_file');
    expect(live).not.toContain('compile_skill_bundle');
    expect(live).not.toContain('export_workspace');

    // 9: the decision itself. A person, on Cherry's own screen, at this exact
    // revision. The agent supplied the link and can do nothing else here.
    await page.goto(new URL(approvalUrl).pathname + new URL(approvalUrl).search);
    const approveButton = page.getByTestId('approve-skill');
    await expect(approveButton).toBeVisible({ timeout: 20_000 });
    await approveButton.click();
    await expect(page.getByText('Approved at this exact version')).toBeVisible();

    // The agent learns the outcome by reading, not by being told in chat.
    await awaitTool(page, 'write_artifact_file');
    const decided = await callTool(page, 'get_cherry_status', {});
    expect(decided.payload.productState).toBe('execution');
    expect(decided.payload.missionState).toBe('EXECUTING');

    // 10: the aperture is execution now, and only execution.
    const executionTools = await hostTools(page);
    expect(executionTools).toContain('record_task_result');
    expect(executionTools).not.toContain('request_skill_approval');

    // 11: several real artifacts. The first carries a placeholder on purpose,
    // so verification has something true to fail on.
    const hero = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hero</title></head><body><h1>Ship your first skill in an afternoon</h1><p>TO' + 'DO: proof block</p></body></html>';
    const wroteHero = await callTool(page, 'write_artifact_file', { path: 'index.html', content: hero, changeSummary: 'First hero draft' });
    expect(wroteHero.isError).toBe(false);
    const wroteNotes = await callTool(page, 'write_artifact_file', { path: 'notes.md', content: '# Hero notes\n\nOne call to action, proof beside the claim.\n', changeSummary: 'Working notes' });
    expect(wroteNotes.isError).toBe(false);

    // 12: the run is recorded as a report, and says so.
    const recorded = await callTool(page, 'record_task_result', { summary: 'Wrote the hero and the notes', outcome: 'succeeded' });
    expect(recorded.isError).toBe(false);
    expect(String(recorded.payload.note)).toContain('verification');

    // 13: verification runs for real and fails for a real reason.
    await awaitTool(page, 'run_verification');
    const failing = await callTool(page, 'run_verification', {});
    expect(failing.isError).toBe(false);
    expect(failing.payload.status).toBe('failed');
    const verificationId = String(failing.payload.verificationId);
    const failures = await callTool(page, 'read_failed_assertions', { verificationId });
    expect(failures.isError).toBe(false);
    expect(JSON.stringify(failures.payload)).toMatch(/placeholder/i);
    const failedAssertionId = String((failures.payload.failed as Array<{ id: string }>)[0]!.id);

    // 14 and 15: a bounded repair, and it only counts because the re-run passes.
    await awaitTool(page, 'apply_verified_repair');
    const repairedHero = hero.replace(/<p>TO.?DO: proof block<\/p>/, '<p>Cherry users shipped a verified skill in one sitting.</p>');
    await callTool(page, 'write_artifact_file', { path: 'index.html', content: repairedHero, changeSummary: 'Replace the placeholder with the proof line' });
    const repaired = await callTool(page, 'apply_verified_repair', {
      verificationId,
      failedAssertionId,
      repairSummary: 'Replaced the placeholder paragraph with the real proof line.',
    });
    expect(repaired.isError).toBe(false);
    expect(repaired.payload.status).toBe('passed');
    expect(String(repaired.payload.note)).toContain('verified');

    // 16: the exports, now that a person approved and the checks passed.
    await awaitTool(page, 'compile_skill_bundle');
    const bundle = await callTool(page, 'compile_skill_bundle', { skillGraphId });
    expect(bundle.isError).toBe(false);
    expect(String(bundle.payload.sha256)).toMatch(HEX_64);

    const receipt = await callTool(page, 'export_proof_receipt', {});
    expect(receipt.isError).toBe(false);
    expect(String(receipt.payload.receiptHash)).toMatch(HEX_64);
    expect(Number(receipt.payload.events)).toBeGreaterThan(0);

    const archive = await callTool(page, 'export_workspace', {});
    expect(archive.isError).toBe(false);
    expect(String(archive.payload.payloadSha256)).toMatch(HEX_64);

    // 17: recompute what is genuinely recomputable from what was returned. The
    // skill file arrives in bounded parts with an advertised contentSha256;
    // reassembling the parts and hashing them has to reproduce it exactly, or
    // the hash is decoration.
    const firstPart = await callTool(page, 'get_skill', { skillId: skillGraphId, format: 'skill-md', part: 1 });
    expect(firstPart.isError).toBe(false);
    const totalParts = Number(firstPart.payload.totalParts);
    const advertised = String(firstPart.payload.contentSha256);
    expect(advertised).toMatch(HEX_64);
    let assembled = String(firstPart.payload.content);
    for (let part = 2; part <= totalParts; part += 1) {
      const next = await callTool(page, 'get_skill', { skillId: skillGraphId, format: 'skill-md', part });
      expect(next.isError, `part ${part}`).toBe(false);
      expect(String(next.payload.contentSha256), `part ${part}`).toBe(advertised);
      assembled += String(next.payload.content);
    }
    expect(await sha256InPage(page, assembled)).toBe(advertised);

    // A part past the end is a validation error, not a silent empty page.
    const overrun = await callTool(page, 'get_skill', { skillId: skillGraphId, format: 'skill-md', part: totalParts + 1 });
    expect(overrun.isError).toBe(true);
    expect(overrun.payload.error).toBe('validation');

    // The bundle and the archive both record when they were exported, so a
    // second export of identical content is a different file and must hash
    // differently. That is the honest behaviour for a download receipt: the
    // digest describes the bytes the person actually received. What has to stay
    // stable is the content those bytes carry, so that is what is asserted.
    const bundleAgain = await callTool(page, 'compile_skill_bundle', { skillGraphId });
    expect(String(bundleAgain.payload.sha256)).toMatch(HEX_64);
    expect(bundleAgain.payload.files).toBe(bundle.payload.files);
    expect(bundleAgain.payload.fileName).toBe(bundle.payload.fileName);
    const archiveAgain = await callTool(page, 'export_workspace', {});
    expect(String(archiveAgain.payload.payloadSha256)).toMatch(HEX_64);
    expect(archiveAgain.payload.missions).toBe(archive.payload.missions);
    expect(archiveAgain.payload.schemaVersion).toBe(archive.payload.schemaVersion);

    // The skill's own content hash is the one that must not move, and it does
    // not: the same revision serves the same bytes on every call.
    const stable = await callTool(page, 'get_skill', { skillId: skillGraphId, format: 'skill-md', part: 1 });
    expect(String(stable.payload.contentSha256)).toBe(advertised);
    expect(Number(stable.payload.revision)).toBe(revision);

    // And the decision that unlocked all of it is on the record, with the
    // approver, the moment, the exact revision and the content it bound to.
    await page.goto('/studio');
    // A navigation tears down every registration and Cherry registers again on
    // boot; a real host re-fetches the aperture at that point, so the test does.
    await expect.poll(() => hostTools(page)).toContain('read_cherry_context');
    const finalStatus = await callTool(page, 'read_cherry_context', {});
    expect(String(finalStatus.payload.mission ? JSON.stringify(finalStatus.payload.mission) : '')).toContain(missionId);
  });
});
