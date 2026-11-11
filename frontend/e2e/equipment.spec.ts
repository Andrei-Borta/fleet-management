import { expect, test } from '@playwright/test';

import type { Equipment } from '../src/app/features/equipment/equipment.models';

test('lists, sorts and filters the fleet', async ({ page }) => {
  const defaults = {
    serial_no: 'TEST',
    hourly_cost: 1250,
    service_interval_days: null,
    service_interval_hours: null,
    last_service_at: null,
    last_service_hours: null,
  };
  const items: Equipment[] = [
    {
      ...defaults,
      id: 1,
      name: 'Crawler excavator',
      type: 'Excavator',
      status: 'available',
      engine_hours: 120,
    },
    {
      ...defaults,
      id: 2,
      name: 'Tower crane',
      type: 'Crane',
      status: 'reserved',
      engine_hours: 25,
    },
    {
      ...defaults,
      id: 3,
      name: 'Mini excavator',
      type: 'Excavator',
      status: 'defective',
      engine_hours: 70,
    },
  ];
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: items }));
  await page.goto('/equipment');

  const table = page.getByRole('table', { name: 'Equipment' });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().getByText('Available')).toBeVisible();
  await expect(rows.first()).toContainText(/1\.250,00\s+RON/);

  await table.getByRole('columnheader', { name: 'Engine hours' }).click();
  await expect(rows.first()).toContainText('Tower crane');
  await table.getByRole('columnheader', { name: 'Engine hours' }).click();
  await expect(rows.first()).toContainText('Crawler excavator');

  await page.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'Excavator' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Defective' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Mini excavator');

  await page.getByRole('textbox', { name: 'Search by name' }).fill('CRAWLER');
  await expect(page.getByText('No equipment matches these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Search by name' }).fill('CRAWLER');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Crawler excavator');
});
