import { expect, test } from '@playwright/test';

const pages = [
  'Dashboard',
  'Equipment',
  'Sites',
  'Reservations',
  'Calendar',
  'Maintenance',
  'Operations',
];

test('app shell loads and redirects to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Fleet Manager', { exact: true })).toBeVisible();
});

for (const name of pages) {
  test(`navigates to ${name}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  });
}

test('role switcher changes role', async ({ page }) => {
  await page.goto('/');
  const switcher = page.getByTestId('role-switcher');
  await switcher.selectOption('mechanic');
  await expect(switcher).toHaveValue('mechanic');
});

test('backend health endpoint is reachable through the proxy', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.ok()).toBeTruthy();
});
