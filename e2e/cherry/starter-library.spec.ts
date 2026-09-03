import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __starterHost: {
      tools: Map<string, { execute: (input: unknown) => Promise<unknown> }>;
    };
  }
}

async function installMockHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: unknown) => Promise<unknown> }>();
    window.__starterHost = { tools };
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown> }, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        });
      },
    };
  });
}

async function callTool(page: Page, name: string, input: unknown): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ([toolName, toolInput]) => {
      const tool = window.__starterHost.tools.get(toolName as string);
      if (!tool) throw new Error(`tool not registered: ${toolName as string}`);
      const result = (await tool.execute(toolInput)) as { isError?: boolean; content: Array<{ text: string }> };
      return {
        isError: result.isError === true,
        payload: JSON.parse(result.content[0]!.text) as Record<string, unknown>,
      };
    },
    [name, input] as const,
  ) as Promise<Record<string, unknown>>;
}

test('starter library loads once, serves cited skills to the host, and resets completely', async ({ page }) => {
  test.setTimeout(120_000);
  await installMockHost(page);
  await page.goto('/showcase');
  await expect.poll(async () => page.evaluate(() => window.__starterHost.tools.has('recommend_skills'))).toBe(true);

  await page.getByTestId('showcase-load-starter-library').click();
  await expect(page).toHaveURL(/\/studio\/skills(\?sample=loaded)?$/);
  await expect(page.getByTestId('sample-loaded-notice')).toContainText('Sample library loaded');
  await expect(page.getByTestId('library-card')).toHaveCount(8);
  await expect(page.getByTestId('library-card').filter({ hasText: 'install-ready' })).toHaveCount(8);
  await expect(page.getByTestId('library-card').filter({ hasText: 'sample state' })).toHaveCount(8);

  const listed = await callTool(page, 'list_skills', { status: 'approved' });
  expect(listed.isError).toBe(false);
  const listedSkills = (listed.payload as { skills: Array<Record<string, unknown>> }).skills;
  expect(listedSkills.length).toBeGreaterThan(0);
  expect(listedSkills[0]).toEqual(expect.objectContaining({
    sample: true,
    approvalKind: 'synthetic-sample-state',
  }));

  const recommended = await callTool(page, 'recommend_skills', { task: 'I need a thumbnail for my video' });
  expect(recommended.isError).toBe(false);
  const recommendations = (recommended.payload as { recommendations: Array<Record<string, unknown>> }).recommendations;
  expect(recommendations.length).toBeGreaterThanOrEqual(1);
  expect(recommendations[0]!.installReady).toBe(true);
  expect(recommendations[0]!.sample).toBe(true);
  expect(recommendations[0]!.approvalKind).toBe('synthetic-sample-state');

  const delivered = await callTool(page, 'get_skill', {
    skillId: recommendations[0]!.skillId as string,
    format: 'skill-md',
  });
  expect(delivered.isError).toBe(false);
  const payload = delivered.payload as {
    content: string;
    contentSha256: string;
    citations: Array<Record<string, unknown>>;
    sample: boolean;
    approvalKind: string;
    sampleNotice: string;
  };
  expect(payload.content).toMatch(/thumbnail/i);
  expect(payload.citations.length).toBeGreaterThan(0);
  expect(payload.sample).toBe(true);
  expect(payload.approvalKind).toBe('synthetic-sample-state');
  expect(payload.sampleNotice).toMatch(/not proof of a live human decision/i);
  expect(payload.citations[0]).toEqual(expect.objectContaining({
    creator: expect.any(String),
    title: expect.any(String),
    url: expect.stringMatching(/^https:\/\/www\.youtube\.com\/watch\?v=/),
    timestampSeconds: expect.any(Number),
  }));

  await page.getByRole('link', { name: recommendations[0]!.name as string }).click();
  await expect(page.getByTestId('skill-sample-notice')).toContainText('not proof of your decision');

  // Loading again reuses the persisted example instead of duplicating skills.
  await page.goto('/showcase');
  await page.getByTestId('showcase-load-starter-library').click();
  await expect(page).toHaveURL(/\/studio\/skills(\?sample=loaded)?$/);
  await expect(page.getByTestId('library-card')).toHaveCount(8);

  await page.goto('/showcase');
  await page.getByTestId('showcase-reset-demo').click();
  await expect(page.getByText('Reset: removed 1 demo workspace(s). Your own workspaces were not touched.')).toBeVisible();
  await expect(page.getByText('Fresh session — no workspace exists in this browser yet.')).toBeVisible();
  await expect.poll(async () => {
    const result = await callTool(page, 'recommend_skills', { task: 'thumbnail' });
    return ((result.payload as { recommendations: unknown[] }).recommendations ?? []).length;
  }).toBe(0);
});
