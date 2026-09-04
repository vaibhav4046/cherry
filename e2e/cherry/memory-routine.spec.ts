import { expect, test } from '@playwright/test';

test.describe('memory and routine surfaces', () => {
  test('empty memory and run states teach one next step', async ({ page }) => {
    await page.goto('/studio/memory');
    await expect(page.getByText('No space is active. Open Studio to choose or create one.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Studio' })).toHaveAttribute('href', '/studio');
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);

    await page.goto('/studio/runs');
    await expect(page.getByText('No space is active. Open Studio to choose or create one.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Studio' })).toHaveAttribute('href', '/studio');
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);
  });

  test('unknown routes render a not-found page', async ({ page }) => {
    await page.goto('/definitely-not-a-cherry-route');
    await expect(page.getByRole('heading', { name: /This page is missing/i })).toBeVisible();
    await expect(page.getByText('The route may have moved, but your saved work is safe.')).toBeVisible();
  });

  test('memory vault exposes graph fallback and no overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studio');
    await page.getByLabel('Space name').fill('Graph mobile workspace');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await page.goto('/studio/memory');
    await expect(page.getByRole('heading', { name: 'Memory Vault' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Memory graph' })).toBeVisible();
    await expect(page.getByLabel('Scope').locator('option')).toHaveText(['This space']);
    await expect(page.getByLabel('Classify as').locator('option')).toHaveText([
      'Space-wide preference',
      'Safety policy',
      'Procedure update',
    ]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('memory choices bind to the active project and keep approvals quiet', async ({ page }) => {
    await page.goto('/studio?demo=1');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await page.goto('/studio/memory');

    await expect(page.getByLabel('Scope').locator('option')).toHaveText(['This space', 'This project']);
    await expect(page.getByLabel('Classify as').locator('option')).toHaveText([
      'Project rule',
      'Space-wide preference',
      'Safety policy',
      'Procedure update',
      'Evaluation assertion',
    ]);

    await page.getByLabel('Title').fill('Use the active project voice');
    await page.getByLabel('Content').fill('Keep the project language calm and concrete.');
    await page.getByLabel('Scope').selectOption('mission');
    await page.getByRole('button', { name: 'Propose memory' }).click();
    const projectProposal = page.getByTestId('memory-proposal').filter({ hasText: 'Use the active project voice' });
    await expect(projectProposal).toContainText('This project');

    await page.getByLabel('What failed').fill('The default applied beyond this space');
    await page.getByLabel('Approved fix').fill('Keep the preference inside this space');
    await page.getByLabel('Classify as').selectOption('global_preference');
    await page.getByRole('button', { name: 'Compile correction' }).click();
    const spaceProposal = page.getByTestId('memory-proposal').filter({ hasText: 'Space-wide preference' });
    await expect(spaceProposal).toContainText('This space');
    await expect(page.locator('main')).not.toContainText(/Everywhere|Global preference|Project preference|One-run instruction/);

    await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(2);
    for (const approve of await page.getByRole('button', { name: 'Approve', exact: true }).all()) {
      await expect(approve).not.toHaveClass(/btn-primary/);
    }

    const binding = await page.evaluate(async () => {
      const activeMissionId = localStorage.getItem('cherry.activeMissionId');
      const request = indexedDB.open('cherry');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction('memories', 'readonly');
      const recordsRequest = transaction.objectStore('memories').getAll();
      const records = await new Promise<Array<{ title: string; scope: string; missionId?: string | null }>>((resolve, reject) => {
        recordsRequest.onsuccess = () => resolve(recordsRequest.result);
        recordsRequest.onerror = () => reject(recordsRequest.error);
      });
      database.close();
      const projectMemory = records.find((record) => record.title === 'Use the active project voice');
      return { activeMissionId, scope: projectMemory?.scope, missionId: projectMemory?.missionId };
    });
    expect(binding).toMatchObject({ scope: 'mission' });
    expect(binding.missionId).toBeTruthy();
    expect(binding.missionId).toBe(binding.activeMissionId);
  });

  test('multiple runnable rows keep dispatch actions quiet', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Space name').fill('Runner action hierarchy');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await page.goto('/studio/missions/new');
    await page.getByLabel('Title').fill('Check two exports');
    await page.getByLabel('Objective').fill('Show more than one honest runner action');
    await page.getByLabel('Definition of done (one item per line)').fill('Both actions are recorded');
    await page.getByRole('button', { name: 'Create project' }).click();

    await page.evaluate(async () => {
      const workspaceId = localStorage.getItem('cherry.activeWorkspaceId');
      const missionId = location.pathname.split('/').filter(Boolean).at(-1) ?? null;
      if (!workspaceId || !missionId) throw new Error('Expected active space and project');
      const request = indexedDB.open('cherry');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction('runs', 'readwrite');
      const store = transaction.objectStore('runs');
      const now = new Date().toISOString();
      const adapters = ['cherry-verify', 'cherry-export', 'manual'] as const;
      for (const [offset, adapter] of adapters.entries()) {
        const index = offset + 1;
        store.put({
          id: `run-action-${index}`,
          workspaceId,
          missionId,
          adapter,
          status: 'waiting_for_runner',
          mode: 'runner',
          summary: `Runner action ${index}`,
          idempotencyKey: `runner-action-${index}`,
          runnerCapabilityToken: `runner-capability-${index}`,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    });

    await page.route('http://127.0.0.1:47821/**', async (route) => {
      const headers = {
        'access-control-allow-origin': 'http://127.0.0.1:4173',
        'access-control-allow-headers': 'content-type,x-cherry-pair',
        'access-control-allow-private-network': 'true',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ paired: true, version: 'test', queueDepth: 2 }) });
    });
    await page.goto('/studio/runs');
    await expect(page.getByText(/Runner paired/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dispatch' })).toHaveCount(3);
    await expect(page.locator('main .btn-primary:visible')).toHaveCount(0);
    for (const dispatch of await page.getByRole('button', { name: 'Dispatch' }).all()) {
      await expect(dispatch).not.toHaveClass(/btn-primary/);
    }
    const unsupportedRow = page.getByRole('row').filter({ hasText: 'Runner action 3' });
    await unsupportedRow.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByRole('alert')).toHaveText("Only Cherry's built-in check and export actions can run here.");
  });
});
