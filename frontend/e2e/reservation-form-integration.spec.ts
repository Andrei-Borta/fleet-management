import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('real API: requests an alternative after a booking conflict', async ({ page, request }) => {
  const api = 'http://localhost:8000/api/v1';
  const unique = `request-${randomUUID()}`;
  const createEquipment = async (name: string, hourlyCost: number) => {
    const response = await request.post(`${api}/equipment`, {
      data: { name, type: unique, serial_no: name, hourly_cost: hourlyCost },
    });
    expect(response.status()).toBe(201);
    return response.json() as Promise<{ id: number }>;
  };
  const original = await createEquipment(`${unique}-booked`, 100);
  const alternative = await createEquipment(`${unique}-alternative`, 80);
  const siteResponse = await request.post(`${api}/sites`, { data: {
    name: unique, address: 'Integration test site', budget: 1000,
    start_date: '2099-11-01', end_date: '2099-11-30',
  } });
  expect(siteResponse.status()).toBe(201);
  const site: { id: number } = await siteResponse.json();
  const bookingResponse = await request.post(`${api}/reservations`, {
    headers: { 'X-Role': 'site_manager' },
    data: { equipment_id: original.id, site_id: site.id, start_date: '2099-11-10', end_date: '2099-11-20' },
  });
  expect(bookingResponse.status()).toBe(201);
  const booking: { id: number } = await bookingResponse.json();
  const approval = await request.post(`${api}/reservations/${booking.id}/approve`);
  expect(approval.status()).toBe(200);
  let createdId: number | undefined;
  try {
    await page.goto(`/sites/${site.id}`);
    await page.getByTestId('role-switcher').selectOption('site_manager');
    await page.getByRole('link', { name: 'Reserve equipment' }).click();
    await page.getByLabel('Start date').fill('2099-11-12');
    await page.getByLabel('End date').fill('2099-11-14');
    await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
    const booked = page.getByRole('dialog', { name: 'Choose equipment' }).getByRole('button', { name: `${unique}-booked (${unique}) Reserved` });
    await expect(booked).toBeVisible();
    await booked.click();
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByRole('alert')).toContainText('This equipment is reserved from 10 Nov 2099 to 20 Nov 2099.');
    const created = page.waitForResponse((response) => response.url().endsWith('/api/v1/reservations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: `Request ${unique}-alternative` }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const reservation: { id: number; equipment_id: number; site_id: number; status: string } = await createdResponse.json();
    createdId = reservation.id;
    expect(reservation).toMatchObject({ equipment_id: alternative.id, site_id: site.id, status: 'pending' });
    await expect(page).toHaveURL(/\/reservations$/);
    await expect(page.getByText('Request sent')).toBeVisible();
  } finally {
    if (createdId !== undefined) await request.post(`${api}/reservations/${createdId}/cancel`);
    await request.post(`${api}/reservations/${booking.id}/cancel`);
    // Reservation history is retained; the unique prefix identifies these test records.
  }
});
