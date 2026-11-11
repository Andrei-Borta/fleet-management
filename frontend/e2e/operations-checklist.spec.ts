import { expect, test } from '@playwright/test';

const equipment = {
  id: 12,
  name: 'Loader',
  type: 'Loader',
  serial_no: 'LD-12',
  status: 'available',
  engine_hours: 100,
  hourly_cost: 150,
  service_interval_days: null,
  service_interval_hours: null,
  last_service_at: null,
  last_service_hours: null,
};

const checklistPath = '**/api/v1/operations/checklists';

test('submits a passing daily checklist for the selected equipment', async ({ page }) => {
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));
  await page.route(checklistPath, async (route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as {
      equipment_id: number;
      date: string;
      items: { name: string; ok: boolean; critical: boolean }[];
    };
    expect(body).toMatchObject({
      equipment_id: equipment.id,
      date: '2026-11-11',
      items: [
        { name: 'Brakes', ok: true, critical: true },
        { name: 'Lights and indicators', ok: true, critical: true },
        { name: 'Fluid or hydraulic leaks', ok: true, critical: true },
        { name: 'Tires or tracks', ok: true, critical: true },
        { name: 'Horn and warning signals', ok: true, critical: false },
        { name: 'Mirrors and visibility', ok: true, critical: false },
      ],
    });
    await route.fulfill({
      status: 201,
      json: {
        id: 1,
        equipment_id: body.equipment_id,
        date: body.date,
        items: body.items.map((item, index) => ({ id: index + 1, ...item })),
      },
    });
  });

  await page.goto('/operations');
  await page.getByRole('combobox', { name: 'Equipment' }).click();
  await page.getByRole('option', { name: 'Loader (LD-12)', exact: true }).click();
  await page.getByTestId('checklist-date').fill('2026-11-11');
  await expect(page.getByTestId('checklist-date')).toHaveValue('2026-11-11');

  for (const id of ['brakes', 'lights', 'leaks', 'tires', 'horn', 'mirrors']) {
    await page
      .getByTestId(`check-item-${id}`)
      .getByRole('radio', { name: 'OK', exact: true })
      .check();
  }
  await expect(page.getByTestId('critical-warning')).toHaveCount(0);
  await page.getByTestId('submit-checklist').click();
  await expect(page.getByTestId('checklist-result')).toContainText('Equipment passed today');
  await expect(page.getByTestId('submit-checklist')).toBeDisabled();
});

test('warns and records when a critical safety item fails', async ({ page }) => {
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));
  await page.route(checklistPath, async (route) => {
    const body = route.request().postDataJSON() as {
      equipment_id: number;
      date: string;
      items: { name: string; ok: boolean; critical: boolean }[];
    };
    expect(body.items.find((item) => item.name === 'Brakes')).toMatchObject({
      ok: false,
      critical: true,
    });
    await route.fulfill({
      status: 201,
      json: {
        id: 2,
        equipment_id: body.equipment_id,
        date: body.date,
        items: body.items.map((item, index) => ({ id: index + 1, ...item })),
      },
    });
  });

  await page.goto('/operations');
  await page.getByRole('combobox', { name: 'Equipment' }).click();
  await page.getByRole('option', { name: 'Loader (LD-12)', exact: true }).click();
  for (const id of ['lights', 'leaks', 'tires', 'horn', 'mirrors']) {
    await page
      .getByTestId(`check-item-${id}`)
      .getByRole('radio', { name: 'OK', exact: true })
      .check();
  }
  await page
    .getByTestId('check-item-brakes')
    .getByRole('radio', { name: 'Not OK', exact: true })
    .check();
  await expect(page.getByTestId('critical-warning')).toContainText('Do not operate this machine.');
  await expect(page.getByTestId('critical-warning')).toContainText('will block the equipment');

  await page.getByTestId('submit-checklist').click();
  await expect(page.getByTestId('checklist-result')).toContainText('Equipment is blocked.');
});

test('checklist remains usable on a narrow screen in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [equipment] }));

  await page.goto('/operations');
  await page.evaluate(() => (document.documentElement.dataset['theme'] = 'dark'));
  await expect(page.getByRole('heading', { name: 'Daily safety checklist' })).toBeVisible();
  await expect(page.getByTestId('check-item-brakes')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
