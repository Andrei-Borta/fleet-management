import { expect, test } from '@playwright/test';

const equipment = {
  id: 12,
  name: 'Excavator',
  type: 'Excavator',
  serial_no: 'EX-12',
  status: 'available',
  engine_hours: 100,
  hourly_cost: 150,
  service_interval_days: null,
  service_interval_hours: null,
  last_service_at: null,
  last_service_hours: null,
};

test('reports a critical defect from equipment details and shows the updated status', async ({ page }) => {
  let status = 'available';
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));
  await page.route('**/api/v1/equipment/12', (route) =>
    route.fulfill({ json: { ...equipment, status } }),
  );
  await page.route('**/api/v1/maintenance/defects', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      equipment_id: 12,
      description: 'Brake failure',
      severity: 'critical',
    });
    status = 'defective';
    await route.fulfill({
      status: 201,
      json: {
        id: 1,
        equipment_id: 12,
        description: 'Brake failure',
        severity: 'critical',
        status: 'open',
        reported_at: '2026-11-11T10:00:00Z',
        resolved_at: null,
      },
    });
  });

  await page.goto('/equipment/12');
  await page.getByRole('link', { name: 'Report defect' }).click();
  await expect(page.getByRole('combobox', { name: 'Equipment' })).toHaveValue('Excavator (EX-12)');
  await expect(page.getByRole('combobox', { name: 'Equipment' })).toBeDisabled();
  await page.getByRole('button', { name: 'Report defect' }).click();
  await expect(page.getByText('Select a severity.')).toBeVisible();
  await expect(page.getByText('Enter a description of up to 2,000 characters.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Description' }).fill('Brake failure');
  await page.getByRole('combobox', { name: 'Severity' }).click();
  await page.getByRole('option', { name: 'Critical' }).click();
  await page.getByRole('button', { name: 'Report defect' }).click();
  await expect(page).toHaveURL(/\/equipment\/12$/);
  await expect(page.getByText('Defective', { exact: true })).toBeVisible();
});

test('opens from maintenance and keeps a failed report available for retry', async ({ page }) => {
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));
  await page.route('**/api/v1/maintenance/defects', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Unable to report defect' } }),
  );
  await page.goto('/maintenance');
  await page.getByRole('link', { name: 'Report defect' }).click();
  await page.getByRole('button', { name: 'Report defect' }).click();
  await expect(page.getByText('Select equipment.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Equipment' })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Equipment' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose equipment' });
  const searchBounds = await picker.getByRole('textbox', { name: 'Search equipment' }).boundingBox();
  const categoryBounds = await picker.getByRole('combobox', { name: 'Category' }).boundingBox();
  expect(searchBounds).not.toBeNull();
  expect(categoryBounds).not.toBeNull();
  expect(Math.abs(searchBounds!.y - categoryBounds!.y)).toBeLessThan(2);
  expect(categoryBounds!.x).toBeGreaterThan(searchBounds!.x);
  await picker.getByRole('textbox', { name: 'Search equipment' }).fill('no match');
  await expect(picker.getByText('No equipment matches these filters.')).toBeVisible();
  await picker.getByRole('textbox', { name: 'Search equipment' }).fill('EX-12');
  await picker.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Excavator' }).click();
  await picker.getByRole('button', { name: /Excavator/ }).click();
  await page.getByRole('combobox', { name: 'Severity' }).click();
  await page.getByRole('option', { name: 'Low' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('Oil leak');
  await page.getByRole('button', { name: 'Report defect' }).click();
  await expect(page.getByText('Unable to report defect')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Oil leak');
  await expect(page.getByRole('button', { name: 'Report defect' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/maintenance$/);
});
