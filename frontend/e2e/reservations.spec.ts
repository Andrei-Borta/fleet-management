import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/sites', (route) =>
    route.fulfill({
      json: [
        { id: 1, name: 'Bridge' },
        { id: 2, name: 'Depot' },
      ],
    }),
  );
  await page.route('**/api/v1/equipment', (route) =>
    route.fulfill({ json: [{ id: 1, name: 'Excavator' }] }),
  );
  await page.route('**/api/v1/reservations', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          equipment_id: 1,
          site_id: 1,
          start_date: '2026-11-10',
          end_date: '2026-11-12',
          status: 'pending',
          requested_by_role: 'site_manager',
          note: 'Morning delivery',
        },
        {
          id: 2,
          equipment_id: 1,
          site_id: 2,
          start_date: '2026-11-15',
          end_date: '2026-11-16',
          status: 'approved',
          requested_by_role: 'fleet_manager',
          note: null,
        },
      ],
    }),
  );
});

test('filters bookings and approves a pending request', async ({ page }) => {
  await page.route('**/reservations/1/approve', (route) =>
    route.fulfill({
      json: {
        id: 1,
        equipment_id: 1,
        site_id: 1,
        start_date: '2026-11-10',
        end_date: '2026-11-12',
        status: 'approved',
        requested_by_role: 'site_manager',
      },
    }),
  );
  await page.goto('/reservations');
  await expect(page.getByRole('cell', { name: 'Bridge', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Depot', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve reservation 1', exact: true }).click();
  await expect(page.getByText('No reservations match these filters.')).toBeVisible();
  await page.getByRole('tab', { name: 'Approved', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Site', exact: true }).click();
  await page.getByRole('option', { name: 'Depot', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
});

test('role changes hide approvals and cancellation requires confirmation', async ({ page }) => {
  let cancelled = false;
  await page.route('**/reservations/1/cancel', (route) => {
    cancelled = true;
    return route.fulfill({ json: { id: 1, status: 'cancelled' } });
  });
  await page.goto('/');
  await page.getByTestId('role-switcher').selectOption('site_manager');
  await page.goto('/reservations');
  await expect(page.getByRole('button', { name: 'Approve reservation 1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel reservation 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(cancelled).toBe(false);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel reservation', exact: true })
    .click();
  await expect(page.getByText('No reservations match these filters.')).toBeVisible();
  expect(cancelled).toBe(true);
  await page.getByTestId('role-switcher').selectOption('operator');
  await page.getByRole('link', { name: 'Reservations', exact: true }).click();
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Approve reservation|Reject reservation|Cancel reservation/ }),
  ).toHaveCount(0);
});

test('conflict preserves request and rejection uses confirmation', async ({ page }) => {
  await page.route('**/reservations/1/approve', (route) =>
    route.fulfill({ status: 409, json: { detail: 'Equipment is already booked', conflicts: [] } }),
  );
  await page.route('**/reservations/1/reject', (route) =>
    route.fulfill({ json: { id: 1, status: 'rejected' } }),
  );
  await page.goto('/reservations');
  await page.getByRole('button', { name: 'Approve reservation 1', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Equipment is already booked');
  await page.getByRole('button', { name: 'Reject reservation 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('No reservations match these filters.')).toBeVisible();
});

test('failed load can be retried', async ({ page }) => {
  await page.route('**/api/v1/reservations', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Unavailable' } }),
  );
  await page.goto('/reservations');
  await expect(page.getByText('Reservations could not be loaded.')).toBeVisible();
  await page.route('**/api/v1/reservations', (route) => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No reservations match these filters.')).toBeVisible();
});

test('paginates requests and exposes tooltip-labelled row actions', async ({ page }) => {
  await page.route('**/api/v1/reservations', (route) =>
    route.fulfill({
      json: Array.from({ length: 21 }, (_, i) => ({
        id: i + 1,
        equipment_id: 1,
        site_id: 1,
        start_date: '2026-11-10',
        end_date: '2026-11-11',
        status: 'pending',
        requested_by_role: 'site_manager',
        note: null,
      })),
    }),
  );
  await page.goto('/reservations');
  await expect(page.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Approve reservation 1', exact: true }).hover();
  await expect(
    page.getByRole('button', { name: 'Approve reservation 1', exact: true }),
  ).toHaveAccessibleDescription('Approve reservation');
  await expect(page.getByText('Approve reservation', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Approve reservation 21', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(21);
});
