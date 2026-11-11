import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import type { Equipment } from '../src/app/features/equipment/equipment.models';
import type { Reservation } from '../src/app/features/reservations/reservations.models';

test('validates, creates and edits equipment using the API', async ({ page, request }) => {
  const key = randomUUID();
  const name = `Test excavator ${key}`;
  let id: number | undefined;
  try {
    await page.goto('/equipment');
    await page.getByRole('link', { name: 'Add equipment' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a serial number.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Type', exact: true }).fill('Excavator');
    await page.getByRole('textbox', { name: 'Serial number' }).fill(key);
    await page.getByRole('spinbutton', { name: 'Hourly cost (RON)' }).fill('105.50');

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/equipment') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const equipment: Equipment = await response.json();
    id = equipment.id;
    await expect(page).toHaveURL(new RegExp(`/equipment/${id}$`));
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(key, { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('link', { name: 'Edit equipment' }).click();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name);
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name + ' updated');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: name + ' updated' })).toBeVisible();
    await page.getByRole('tab', { name: 'Reservations' }).click();
    await expect(page.getByText('No reservations for this equipment.')).toBeVisible();
  } finally {
    if (id !== undefined) await request.delete(`/api/v1/equipment/${id}`);
  }
});

test('shows reservation history and retries unavailable maintenance history', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/v1/reservations');
  expect(response.ok()).toBeTruthy();
  const reservations: Reservation[] = await response.json();
  expect(reservations.length).toBeGreaterThan(0);
  const reservation = reservations[0];
  const id = reservation.equipment_id;
  let attempts = 0;
  await page.route('**/api/v1/maintenance/interventions?*', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('equipment_id')).toBe(String(id));
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 404, json: { detail: 'Not Found' } });
      return;
    }
    await route.fulfill({
      json: [
        {
          id: 1,
          equipment_id: id,
          defect_id: null,
          description: 'Replace hydraulic hose',
          kind: 'repair',
          scheduled_date: '2026-11-10',
          status: 'done',
          started_at: '2026-11-10T08:00:00Z',
          completed_at: '2026-11-10T09:00:00Z',
          labor_hours: 1,
          labor_rate: 150,
          parts: [],
          total_cost: 150,
        },
      ],
    });
  });
  await page.goto(`/equipment/${id}`);
  await page.getByRole('tab', { name: 'Reservations' }).click();
  await expect(
    page
      .getByRole('list', { name: 'Equipment reservations' })
      .getByText(`Site #${reservation.site_id}`, { exact: true })
      .first(),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Maintenance' }).click();
  await expect(page.getByText('Maintenance history is unavailable on this server.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  const history = page.getByRole('list', { name: 'Maintenance interventions' });
  await expect(history.getByText('Replace hydraulic hose')).toBeVisible();
  await expect(history.getByText('Done')).toBeVisible();
});
