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
      registrations: number;
    };
  }
}

async function installMockHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map();
    const host = { tools, registrations: 0 };
    (window as unknown as { __host: typeof host }).__host = host;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown>; annotations?: Record<string, unknown> }, options?: { signal?: AbortSignal }) {
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
    expect(discovered).toEqual(expect.arrayContaining(['read_cherry_context', 'list_cherry_capabilities', 'get_cherry_status', 'introduce_agent']));
    expect(discovered).not.toContain('load_lesson');
    expect(discovered).not.toContain('generate_quick_skill');

    // The agent introduces itself and starts the apprenticeship — registered closures only.
    await callTool(page, 'introduce_agent', { name: 'Codex (e2e host)' });
    const started = await callTool(page, 'start_apprenticeship', { workspaceName: 'Host journey' });
    expect(started.isError).toBe(false);

    // The aperture must advance to expose load_lesson WITHOUT any human click.
    await expect.poll(() => hostTools(page)).toContain('load_lesson');
    await expect(page.getByTestId('showcase-steps')).toContainText('Mission "Learn a lesson and prove it" (DRAFT)');

    const lesson = await callTool(page, 'load_lesson', { title: 'Semantic hero sections', kind: 'manual' });
    expect(lesson.isError).toBe(false);
    const lessonId = (lesson.payload as Record<string, unknown>).lessonId as string;

    // DRAFT → LEARNING happened inside the tool; learning tools appear.
    await expect.poll(() => hostTools(page)).toContain('import_transcript');
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
    const skill = await callTool(page, 'generate_quick_skill', { lessonId });
    expect(skill.isError).toBe(false);
    const skillGraphId = (skill.payload as Record<string, unknown>).skillGraphId as string;

    await expect.poll(() => hostTools(page)).toContain('request_checkpoint_approval');
    const request = await callTool(page, 'request_checkpoint_approval', {
      skillGraphId,
      reason: 'Draft derived from the lesson; requesting human review of r1.',
    });
    expect(request.isError).toBe(false);

    // No registered tool may decide an approval.
    const afterRequest = await hostTools(page);
    expect(afterRequest.some((name) => /approve|decide/.test(name))).toBe(false);

    // The human decides in the UI — the only path.
    await expect(page.getByTestId('showcase-approval')).toBeVisible();
    await page.getByRole('button', { name: 'Approve this exact revision' }).click();
    await expect(page.getByTestId('showcase-steps')).toContainText(/Approved at exactly r\d+/);

    // The agent continues: context now reports the approval as decided.
    const context = await callTool(page, 'read_cherry_context', {});
    expect((context.payload as { pendingApprovals: unknown[] }).pendingApprovals).toHaveLength(0);
    const status = await callTool(page, 'get_cherry_status', {});
    expect((status.payload as Record<string, unknown>).productState).toBe('planning');

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
    await expect(page.getByText('SAMPLE DATA')).toBeVisible();
  });
});
