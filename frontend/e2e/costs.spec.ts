import { expect, test } from '@playwright/test';
const sites = [
  {
    site_id: 1,
    site_name: 'Bridge',
    budget: 1000,
    equipment_cost: 900,
    maintenance_cost: 350,
    spent: 1250,
    remaining: -250,
    percent_used: 125,
    over_budget: true,
  },
  {
    site_id: 2,
    site_name: 'Depot',
    budget: 0,
    equipment_cost: 0,
    maintenance_cost: 0,
    spent: 0,
    remaining: 0,
    percent_used: 0,
    over_budget: false,
  },
];
test('shows budget comparison, filters, and drills into equipment and maintenance', async ({
  page,
}) => {
  await page.route('**/api/v1/dashboard/costs', (route) => route.fulfill({ json: { sites } }));
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Site costs', exact: true }).click();
  await expect(page.getByText('Over budget ·')).toBeVisible();
  await expect(page.getByRole('cell', { name: '1.250,00 RON', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View costs for Bridge', exact: true }).click();
  const breakdown = page.getByTestId('cost-breakdown');
  await expect(breakdown.getByText('900,00 RON', { exact: true })).toBeVisible();
  await expect(breakdown.getByText('350,00 RON', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Site', exact: true }).click();
  await page.getByRole('option', { name: 'Depot', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Bridge', exact: true })).toHaveCount(0);
  await expect(page.getByText('(no budget allocated)')).toBeVisible();
  await expect(breakdown).toHaveCount(0);
});
test('empty and failed reports have useful states and retry', async ({ page }) => {
  await page.route('**/api/v1/dashboard/costs', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Unavailable' } }),
  );
  await page.goto('/dashboard/costs');
  await expect(page.getByText('Site costs could not be loaded.')).toBeVisible();
  await page.route('**/api/v1/dashboard/costs', (route) => route.fulfill({ json: { sites: [] } }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No site costs to display.')).toBeVisible();
});

test('paginates site costs', async ({ page }) => {
  await page.route('**/api/v1/dashboard/costs', (route) =>
    route.fulfill({
      json: {
        sites: Array.from({ length: 21 }, (_, i) => ({
          ...sites[0],
          site_id: i + 1,
          site_name: `Site ${i + 1}`,
        })),
      },
    }),
  );
  await page.goto('/dashboard/costs');
  await expect(page.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'View costs for Site 21', exact: true }),
  ).toBeVisible();
});
