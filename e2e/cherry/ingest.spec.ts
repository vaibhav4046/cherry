import { expect, test } from '@playwright/test';

test.describe('Save to Cherry ingest', () => {
  test('prefills a fresh article, waits for permission, and persists normalized provenance', async ({ page }) => {
    await page.goto('/ingest?url=https%3A%2F%2Fexample.com%2Fpost&title=Example');

    await expect(page).toHaveURL('/ingest?url=https%3A%2F%2Fexample.com%2Fpost&title=Example');
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText('Cherry Wine Studio', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Article or post/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Title')).toHaveValue('Example');
    await expect(page.getByLabel('URL (metadata only)')).toHaveValue('https://example.com/post');

    const permission = page.getByRole('checkbox');
    await expect(permission).not.toBeChecked();
    await expect(permission).toBeFocused();
    await permission.check();
    await page.getByRole('button', { name: 'Save locally' }).click();

    const card = page.getByTestId('source-card').filter({ hasText: 'Example' });
    await expect(card).toBeVisible();
    await expect(card.locator('a[href="https://example.com/post"]')).toHaveAttribute('href', 'https://example.com/post');
    await expect(page.getByText('My skills', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('source-card').filter({ hasText: 'Example' })).toBeVisible();
  });

  test('saves text as a note without presenting or recording a permission assertion', async ({ page }) => {
    await page.goto('/ingest?title=Private%20note&text=Check%20the%20evidence.');

    await expect(page.getByRole('button', { name: /^Note/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Title')).toHaveValue('Private note');
    await expect(page.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('Check the evidence.');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save locally' }).click();

    await expect(page.getByTestId('source-card').filter({ hasText: 'Private note' })).toContainText('Ready for skill');
  });

  test('selects YouTube only for an official YouTube query', async ({ page }) => {
    await page.goto('/ingest?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&title=Video');
    await expect(page.getByRole('button', { name: /YouTube lesson/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('URL (metadata only)')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('renders the exact draggable bookmarklet without executing it', async ({ page }) => {
    await page.goto('/studio/sources');
    const bookmarklet = page.getByRole('link', { name: 'Save to Cherry' });
    await expect(bookmarklet).toHaveAttribute('draggable', 'true');
    expect(await bookmarklet.getAttribute('href')).toBe(
      "javascript:(()=>{window.open('http://127.0.0.1:4173/ingest?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener');})();",
    );
    await expect(page.getByText("Works on any page you're viewing. Cherry only receives the address and title you send it.")).toBeVisible();
    await expect(page.getByText('A browser extension is not part of this sprint.')).toBeVisible();
  });
});
