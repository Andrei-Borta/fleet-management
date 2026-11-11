import { expect, test } from '@playwright/test';

test('operator logs equipment hours and fuel and sees per-site totals in history', async ({ page }) => {
  const unique = `usage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const equipment = {
    id: 101,
    name: `${unique}-loader`,
    type: 'loader',
    serial_no: unique,
    status: 'available',
    engine_hours: 50,
    hourly_cost: 75,
    service_interval_days: null,
    service_interval_hours: null,
    last_service_at: null,
    last_service_hours: null,
  };
  const site = {
    id: 201,
    name: `${unique}-site`,
    address: 'Usage log Playwright test',
    budget: 10000,
    start_date: '2099-01-01',
    end_date: '2099-12-31',
  };
  const usage: {
    id: number;
    equipment_id: number;
    site_id: number;
    date: string;
    hours: number;
    fuel_liters: number;
  }[] = [];

  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));
  await page.route('**/api/v1/sites', (route) => route.fulfill({ json: [site] }));
  await page.route('**/api/v1/operations/usage', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Omit<(typeof usage)[number], 'id'>;
      const entry = { ...payload, id: usage.length + 1 };
      usage.unshift(entry);
      await route.fulfill({ status: 201, json: entry });
      return;
    }
    await route.fulfill({
      json: {
        items: usage,
        total_hours: usage.reduce((total, item) => total + item.hours, 0),
        total_fuel_liters: usage.reduce((total, item) => total + item.fuel_liters, 0),
      },
    });
  });

  await page.goto('/operations');
  await page.getByTestId('role-switcher').selectOption('operator');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('option', { name: equipment.name, exact: true }).click();
  await page.getByRole('combobox', { name: 'Site', exact: true }).click();
  await page.getByRole('option', { name: site.name, exact: true }).click();
  await page.getByLabel('Date').fill('2099-12-08');
  await page.getByLabel('Hours worked').fill('7.5');
  await page.getByLabel('Fuel (liters)').fill('23.25');

  await page.getByTestId('save-usage').click();
  await expect.poll(() => usage.length).toBe(1);
  expect(usage[0]).toMatchObject({
    equipment_id: equipment.id,
    site_id: site.id,
    date: '2099-12-08',
    hours: 7.5,
    fuel_liters: 23.25,
  });
  await expect(page.getByText('Usage logged')).toBeVisible();
  await expect(
    page.getByText('Enter non-negative hours with up to two decimal places.'),
  ).toHaveCount(0);
  await expect(
    page.getByText('Enter non-negative liters with up to two decimal places.'),
  ).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Filter equipment' }).click();
  await page.getByRole('option', { name: equipment.name, exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter site' }).click();
  await page.getByRole('option', { name: site.name, exact: true }).click();

  const totals = page.getByRole('table', { name: 'Usage totals by equipment and site' });
  await expect(totals.getByRole('row').nth(1)).toContainText(equipment.name);
  await expect(totals.getByRole('row').nth(1)).toContainText(site.name);
  await expect(totals.getByRole('row').nth(1)).toContainText('7.50');
  await expect(totals.getByRole('row').nth(1)).toContainText('23.25');

  const history = page.getByRole('table', { name: 'Usage history' });
  await expect(history.getByRole('row').nth(1)).toContainText('08 Dec 2099');
  await expect(history.getByRole('row').nth(1)).toContainText('7.50');
  await expect(history.getByRole('row').nth(1)).toContainText('23.25');
});