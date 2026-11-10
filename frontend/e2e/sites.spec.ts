import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import type { Reservation } from '../src/app/features/reservations/reservations.models';
import type { Site } from '../src/app/features/sites/sites.models';

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
  await page.goto(`/sites/${reservation.site_id}`);
  const list = page.getByRole('list', { name: 'Site reservations' });
  const equipment = list
    .getByText(`Equipment #${reservation.equipment_id}`, { exact: true })
    .first();
  await expect(equipment).toBeVisible();
  await expect(
    list.locator(`app-status-badge[data-status="${reservation.status}"]`).first(),
  ).toBeVisible();
});
