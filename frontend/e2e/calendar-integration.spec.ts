import { expect, test } from '@playwright/test';

test('real API: shows a booking on the calendar and opens its details', async ({
  page,
  request,
}) => {
  const api = 'http://localhost:8000/api/v1';
  const unique = `UI-${Date.now()}`;
  const equipmentResponse = await request.post(`${api}/equipment`, {
    data: { name: unique, type: unique, serial_no: unique, hourly_cost: 100 },
  });
  expect(equipmentResponse.ok()).toBeTruthy();
  const equipment = await equipmentResponse.json();
  const siteResponse = await request.post(`${api}/sites`, {
    data: {
      name: unique,
      address: 'Integration test site',
      budget: 1000,
      start_date: '2026-11-01',
      end_date: '2026-12-31',
    },
  });
  expect(siteResponse.ok()).toBeTruthy();
  const site = await siteResponse.json();
  const bookingResponse = await request.post(`${api}/reservations`, {
    headers: { 'X-Role': 'site_manager' },
    data: {
      equipment_id: equipment.id,
      site_id: site.id,
      start_date: '2026-11-10',
      end_date: '2026-11-11',
    },
  });
  expect(bookingResponse.ok()).toBeTruthy();
  const booking = await bookingResponse.json();
  const approval = await request.post(`${api}/reservations/${booking.id}/approve`);
  expect(approval.ok()).toBeTruthy();
  try {
    await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
    await page.goto('/calendar');
    await page.getByRole('combobox', { name: 'Equipment type', exact: true }).click();
    await page.getByRole('option', { name: unique, exact: true }).click();
    await page
      .getByRole('button', {
        name: `reservation ${booking.id} for ${unique} on 2026-11-10`,
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog').getByText('Approved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  } finally {
    await request.post(`${api}/reservations/${booking.id}/cancel`);
    // The API keeps reservation history, so test records remain traceable by their unique name.
  }
});

for (const width of [375, 1440]) {
  test(`feature layouts fit ${width}px in light and dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['calendar']) {
      await page.goto(`/${path}`);
      await expect(page.getByTestId('page-title')).toBeVisible();
      await expect(page.locator('mat-progress-bar')).toHaveCount(0);
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByTestId('theme-toggle').click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: `test-results/layout-${path.replace('/', '-')}-${width}-${theme}.png`,
          fullPage: true,
        });
      }
      // Reset before the next route, since the theme survives navigation.
      await page.getByTestId('theme-toggle').click();
    }
  });
}
