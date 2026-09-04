import { expect, test, type Page } from '@playwright/test';

/**
 * Registered-closure host-path test: installs a WebMCP mock host BEFORE the app
 * loads, then drives the fresh apprenticeship journey exclusively through the
 * closures the app actually registered on document.modelContext — never through
 * executeLocal, never by poking context ids. The one human act is the approval
 * click in the /showcase UI, exactly as in a real session.
 */

declare global {
  interface Window {
    __host: {
      tools: Map<string, { execute: (input: unknown) => Promise<unknown>; annotations?: Record<string, unknown> }>;
      retired: Map<string, { execute: (input: unknown) => Promise<unknown> }>;
      registrations: number;
    };
  }
}

async function installMockHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map();
    const retired = new Map();
    const host = { tools, retired, registrations: 0 };
    (window as unknown as { __host: typeof host }).__host = host;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown>; annotations?: Record<string, unknown> }, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        host.registrations += 1;
        options?.signal?.addEventListener('abort', () => {
          retired.set(tool.name, tool);
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        });
      },
    };
  });
}

async function hostTools(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__host.tools.keys()].sort());
}

async function callTool(page: Page, name: string, input: unknown): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ([toolName, toolInput]) => {
      const tool = window.__host.tools.get(toolName as string);
      if (!tool) throw new Error(`tool not registered: ${toolName as string} (have: ${[...window.__host.tools.keys()].join(', ')})`);
      const result = (await tool.execute(toolInput)) as { isError?: boolean; content: Array<{ text: string }> };
      return { isError: result.isError === true, payload: JSON.parse(result.content[0]!.text) as Record<string, unknown> };
    },
    [name, input] as const,
  ) as Promise<Record<string, unknown>>;
}

test.describe('showcase: fresh journey through registered WebMCP closures', () => {
  test('clear storage → discover → start → lesson → evidence → approval (human) → agent continues', async ({ page }) => {
    test.setTimeout(120_000);
    await installMockHost(page);
    await page.goto('/showcase');
    await expect(page.getByRole('heading', { name: 'Watch a lesson become a proven skill' })).toBeVisible();

    // Fresh browser: empty session, host attached, no completed sample hiding anywhere.
    await expect(page.getByText('Fresh session — no workspace exists in this browser yet.')).toBeVisible();
    await expect(page.getByTestId('showcase-host')).toContainText('Host attached');

    // Discovery: global reads plus the empty aperture; learning tools must NOT exist yet.
    await expect.poll(() => hostTools(page)).toContain('start_apprenticeship');
    const discovered = await hostTools(page);
    expect(discovered).toEqual(expect.arrayContaining(['read_cherry_context', 'list_cherry_capabilities', 'get_cherry_status', 'introduce_agent', 'list_skills', 'recommend_skills', 'get_skill']));
    expect(discovered).not.toContain('load_lesson');
    expect(discovered).not.toContain('derive_skill');

    // The agent introduces itself and starts the apprenticeship — registered closures only.
    await callTool(page, 'introduce_agent', { name: 'Codex (e2e host)' });
    const started = await callTool(page, 'start_apprenticeship', { workspaceName: 'Host journey' });
    expect(started.isError).toBe(false);

    // The aperture must advance to expose load_lesson WITHOUT any human click. The onboarding
    // aperture still includes start_apprenticeship, so that registration stays live (no churn):
    // only names that leave the aperture are retired.
    await expect.poll(() => hostTools(page)).toContain('load_lesson');
    expect(await page.evaluate(() => window.__host.retired.has('start_apprenticeship'))).toBe(false);
    await expect(page.getByTestId('showcase-steps')).toContainText('Mission "Learn a lesson and prove it" (DRAFT)');

    const lesson = await callTool(page, 'load_lesson', { title: 'Semantic hero sections', kind: 'manual' });
    expect(lesson.isError).toBe(false);
    const lessonId = (lesson.payload as Record<string, unknown>).lessonId as string;

    // DRAFT → LEARNING happened inside the tool; learning tools appear, and the names that left
    // the aperture are retired: their old closures refuse instead of mutating stale state.
    await expect.poll(() => hostTools(page)).toContain('import_transcript');
    await expect.poll(() => page.evaluate(() => window.__host.retired.has('start_apprenticeship'))).toBe(true);
    const retiredResult = await page.evaluate(async () => {
      const stale = window.__host.retired.get('start_apprenticeship');
      if (!stale) return null;
      const result = (await stale.execute({})) as { isError?: boolean; content: Array<{ text: string }> };
      return { isError: result.isError === true, payload: JSON.parse(result.content[0]!.text) as Record<string, unknown> };
    });
    expect(retiredResult?.isError).toBe(true);
    expect(await hostTools(page)).not.toContain('start_apprenticeship');
    const transcript = await callTool(page, 'import_transcript', {
      lessonId,
      text: '00:05 A hero section needs exactly one real h1.\n00:12 Spacing groups related content.\n00:20 Focus must stay visible for keyboard users.',
    });
    expect(transcript.isError).toBe(false);

    const evidence = await callTool(page, 'add_source_evidence', {
      lessonId,
      claim: 'The lesson demands exactly one meaningful h1 in the hero',
      timestampSeconds: 5,
      sourceType: 'transcript',
    });
    expect(evidence.isError).toBe(false);

    // Showcase evidence step reflects the real records.
    await expect(page.getByTestId('showcase-steps')).toContainText('evidence record');

    // Draft a skill from the lesson, then request approval — the agent can only request.
    const skill = await callTool(page, 'derive_skill', { lessonId });
    expect(skill.isError).toBe(false);
    const skillGraphId = (skill.payload as Record<string, unknown>).skillGraphId as string;

    await expect.poll(() => hostTools(page)).toContain('request_skill_approval');
    const request = await callTool(page, 'request_skill_approval', {
      skillGraphId,
      reason: 'Draft derived from the lesson; requesting human review of r1.',
    });
    expect(request.isError).toBe(false);

    // No registered tool may decide an approval.
    const afterRequest = await hostTools(page);
    expect(afterRequest.some((name) => /approve|decide/.test(name))).toBe(false);

    // Requesting approval now brings the decision to the person: the tool calls
    // presentPath, so Cherry navigates to the skill's own approval screen rather
    // than leaving a pending decision buried on the page the agent happened to
    // be on. Follow it, and decide there — that screen is the only path.
    await page.waitForURL(/\/studio\/skills\/[^/?]+\?approval=/, { timeout: 10_000 });
    const approve = page.getByTestId('approve-skill');
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(page.getByText(/Approved at this exact version/i)).toBeVisible();

    // Back to the judge route to confirm the agent's own view of the decision.
    await page.goto('/showcase');

    // The agent continues: context now reports the approval as decided.
    // The navigation retired every registration; Cherry registers again on boot
    // and a real host re-reads the aperture before calling, so the test does too.
    await expect.poll(() => hostTools(page)).toContain('read_cherry_context');
    const context = await callTool(page, 'read_cherry_context', {});
    expect((context.payload as { pendingApprovals: unknown[] }).pendingApprovals).toHaveLength(0);
    const status = await callTool(page, 'get_cherry_status', {});
    // Approval is what unlocks execution: the write/verify tools only exist
    // once a person has approved the exact revision, so the state moves on.
    expect((status.payload as Record<string, unknown>).productState).toBe('execution');

    // The library serves the approved skill back to the visiting agent — the
    // site upgrades the agent. The three read tools are global (available from
    // first paint); only now do they have an install-ready skill to serve.
    const libraryList = await callTool(page, 'list_skills', { status: 'approved' });
    expect(libraryList.isError).toBe(false);
    const listedSkills = (libraryList.payload as { skills: Array<Record<string, unknown>> }).skills;
    expect(listedSkills.length).toBeGreaterThanOrEqual(1);
    expect(listedSkills[0]!.installReady).toBe(true);

    const recommendation = await callTool(page, 'recommend_skills', { task: 'build a semantic hero section with a single h1' });
    expect(recommendation.isError).toBe(false);
    const recommendations = (recommendation.payload as { recommendations: Array<Record<string, unknown>> }).recommendations;
    expect(recommendations.length).toBeGreaterThanOrEqual(1);
    expect(recommendations[0]!.installReady).toBe(true);
    expect((recommendations[0]!.matchedOn as string[]).length).toBeGreaterThan(0);

    // Install content streams in bounded parts (results are size-capped); the
    // agent joins them and verifies the full-file hash — receipts philosophy
    // applied to skill delivery.
    const firstPart = await callTool(page, 'get_skill', { skillId: recommendations[0]!.skillId as string, format: 'skill-md' });
    expect(firstPart.isError).toBe(false);
    const firstPayload = firstPart.payload as { content: string; part: number; totalParts: number; contentSha256: string; revision: number };
    expect(firstPayload.part).toBe(1);
    expect(firstPayload.content).toContain('name:');
    expect(firstPayload.revision).toBe(recommendations[0]!.revision);
    let joined = firstPayload.content;
    for (let part = 2; part <= firstPayload.totalParts; part += 1) {
      const next = await callTool(page, 'get_skill', { skillId: recommendations[0]!.skillId as string, format: 'skill-md', part });
      expect(next.isError).toBe(false);
      joined += (next.payload as { content: string }).content;
    }
    const joinedSha = await page.evaluate(async (text) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }, joined);
    expect(joinedSha).toBe(firstPayload.contentSha256);

    // Event timeline shows both actors — agent mutations and the human decision.
    await expect(page.getByRole('heading', { name: 'Event timeline (append-only)' })).toBeVisible();
    await expect(page.getByText('AGENT').first()).toBeVisible();
    await expect(page.getByText('HUMAN').first()).toBeVisible();
  });

  test('showcase without a WebMCP host is honest and fully usable manually', async ({ page }) => {
    await page.goto('/showcase');
    await expect(page.getByTestId('showcase-host')).toContainText('No WebMCP host');
    await page.getByTestId('showcase-start-fresh').click();
    await expect(page.getByText(/Fresh workspace created/)).toBeVisible();
    await page.getByRole('button', { name: 'Create the mission' }).click();
    await expect(page.getByTestId('showcase-steps')).toContainText('Mission "Learn a lesson and prove it" (DRAFT)');
  });

  test('sample workspace is opt-in and visibly labelled', async ({ page }) => {
    await page.goto('/showcase');
    await expect(page.getByText('Fresh session — no workspace exists in this browser yet.')).toBeVisible();
    await page.getByTestId('showcase-load-sample').click();
    await expect(page.getByText(/SAMPLE workspace imported \(hash verified\)/)).toBeVisible();
    await expect(page.getByText('SAMPLE DATA', { exact: true })).toBeVisible();
  });

  test('reset demo removes only demo workspaces and returns to a fresh session', async ({ page }) => {
    await page.goto('/showcase');
    await page.getByTestId('showcase-load-sample').click();
    await expect(page.getByText('SAMPLE DATA', { exact: true })).toBeVisible();
    await page.getByTestId('showcase-start-fresh').click();
    await expect(page.getByText(/Fresh workspace created/)).toBeVisible();
    await page.getByTestId('showcase-reset-demo').click();
    await expect(page.getByText(/Reset: removed 2 demo workspace\(s\)/)).toBeVisible();
    await expect(page.getByText('Fresh session — no workspace exists in this browser yet.')).toBeVisible();
    await expect(page.getByTestId('showcase-judge-card')).toContainText('Judging Cherry? The 90-second path');
  });
});
