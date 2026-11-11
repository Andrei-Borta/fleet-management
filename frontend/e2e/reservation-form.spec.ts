import { expect, test } from '@playwright/test';

test('opens the reservation route from each entry point', async ({ page }) => {
  await page.route('**/api/v1/sites/42', (route) =>
    route.fulfill({
      json: {
        id: 42,
        name: 'North Ring Road',
        address: 'Road',
        budget: 1000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    }),
  );
  await page.route('**/api/v1/reservations?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [] }));

  await page.goto('/sites/42');
  await page.getByRole('link', { name: 'Reserve equipment' }).click();
  await expect(page).toHaveURL(/\/reservations\/new\?site_id=42$/);
  await expect(page.getByRole('heading', { name: 'New reservation' })).toBeVisible();

  for (const path of ['/dashboard', '/reservations']) {
    await page.goto(path);
    await page.getByRole('link', { name: 'New reservation' }).click();
    await expect(page).toHaveURL(/\/reservations\/new$/);
    await expect(page.getByRole('heading', { name: 'New reservation' })).toBeVisible();
  }
});

test('site actions fit on a narrow screen in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route('**/api/v1/sites/42', (route) =>
    route.fulfill({
      json: {
        id: 42,
        name: 'North Ring Road',
        address: 'Road',
        budget: 1000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    }),
  );
  await page.route('**/api/v1/reservations?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [] }));
  await page.goto('/sites/42');
  await expect(page.getByRole('link', { name: 'Reserve equipment' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
