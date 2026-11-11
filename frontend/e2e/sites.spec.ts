import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import type { Equipment } from '../src/app/features/equipment/equipment.models';
import type { Reservation } from '../src/app/features/reservations/reservations.models';
import type { Site } from '../src/app/features/sites/sites.models';

async function mockSiteWithReservation(page: Page): Promise<void> {
  await page.route('**/api/v1/sites/987654', (route) =>
    route.fulfill({
      json: {
        id: 987654,
        name: 'Test site',
        address: 'Road',
        budget: 100,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    }),
  );
  await page.route('**/api/v1/reservations?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          equipment_id: 42,
          site_id: 987654,
          start_date: '2026-01-02',
          end_date: '2026-01-03',
          status: 'approved',
          requested_by_role: 'site_manager',
          note: null,
        },
      ],
    }),
  );
}

test('validates dates and creates and edits a site using the API', async ({ page, request }) => {
  const name = `Test site ${randomUUID()}`;
  let id: number | undefined;
  try {
    await page.goto('/sites');
    await page.getByRole('link', { name: 'Add site' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Address' }).fill('1 Example Street');
    await page.getByRole('spinbutton', { name: 'Budget (RON)' }).fill('1250');
    await page.getByLabel('Start date').fill('2026-11-15');
    await page.getByLabel('End date').fill('2026-11-14');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('End date must be on or after the start date.')).toBeVisible();

    await page.getByLabel('End date').fill('2026-12-01');
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/sites') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const site: Site = await response.json();
    id = site.id;
    await expect(page).toHaveURL(new RegExp(`/sites/${id}$`));
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('No reservations for this site.')).toBeVisible();

    await page.getByRole('link', { name: 'Edit site' }).click();
    await expect(page.getByRole('textbox', { name: 'Address' })).toHaveValue('1 Example Street');
    await page.getByRole('spinbutton', { name: 'Budget (RON)' }).fill('1500');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/1\.500,00\s+RON/)).toBeVisible();

    await page.getByRole('link', { name: 'Back to sites' }).click();
    const row = page
      .getByRole('table', { name: 'Sites' })
      .getByRole('row')
      .filter({ hasText: name });
    await expect(row.getByRole('link', { name })).toBeVisible();
    await expect(row).toContainText(/1\.500,00\s+RON/);
    await expect(row).toContainText('15 Nov 2026');
    await expect(row).toContainText('01 Dec 2026');
  } finally {
    if (id !== undefined) await request.delete(`/api/v1/sites/${id}`);
  }
});

test('opens a site and shows its reserved equipment', async ({ page, request }) => {
  const response = await request.get('/api/v1/reservations');
  expect(response.ok()).toBeTruthy();
  const reservations: Reservation[] = await response.json();
  expect(reservations.length).toBeGreaterThan(0);
  const reservation = reservations[0];
  const equipmentResponse = await request.get('/api/v1/equipment');
  expect(equipmentResponse.ok()).toBeTruthy();
  const machines: Equipment[] = await equipmentResponse.json();
  const machine = machines.find((item) => item.id === reservation.equipment_id);
  expect(machine).toBeDefined();
  if (!machine) throw new Error('Reservation equipment was not returned by the API');
  await page.goto(`/sites/${reservation.site_id}`);
  const list = page.getByRole('list', { name: 'Site reservations' });
  await expect(list.getByText(machine.name, { exact: true }).first()).toBeVisible();
  await expect(
    list.locator(`app-status-badge[data-status="${reservation.status}"]`).first(),
  ).toBeVisible();
});

test('shows a fallback when a reservation has no matching equipment', async ({ page }) => {
  await mockSiteWithReservation(page);
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [] }));

  await page.goto('/sites/987654');
  await expect(
    page.getByRole('list', { name: 'Site reservations' }).getByText('Equipment #42'),
  ).toBeVisible();
});

test('retries loading reservations and equipment after an equipment request fails', async ({
  page,
}) => {
  await mockSiteWithReservation(page);
  let attempts = 0;
  await page.route('**/api/v1/equipment', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { detail: 'Equipment unavailable' } })
      : route.fulfill({ json: [{ id: 42, name: 'Test excavator' }] });
  });

  await page.goto('/sites/987654');
  await expect(page.getByText('Reservations could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('list', { name: 'Site reservations' }).getByText('Test excavator'),
  ).toBeVisible();
});

for (const width of [375, 1440]) {
  test(`site reservations fit at ${width}px in light and dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockSiteWithReservation(page);
    await page.route('**/api/v1/equipment', (route) =>
      route.fulfill({ json: [{ id: 42, name: 'Tadano ATF 60 Crane' }] }),
    );
    await page.goto('/sites/987654');
    await expect(
      page.getByRole('list', { name: 'Site reservations' }).getByText('Tadano ATF 60 Crane'),
    ).toBeVisible();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/site-detail-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  });
}
