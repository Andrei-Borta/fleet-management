import { expect, test } from '@playwright/test';
const events = [
  {
    type: 'reservation',
    id: 1,
    equipment: { id: 1, name: 'Excavator', type: 'Excavator' },
    site: { id: 1, name: 'Bridge' },
    start: '2026-11-09',
    end: '2026-11-11',
    status: 'approved',
  },
  {
    type: 'maintenance',
    id: 2,
    equipment: { id: 2, name: 'Crane', type: 'Crane' },
    site: null,
    start: '2026-11-08',
    end: null,
    status: 'in_progress',
  },
];
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
  await page.route('**/api/v1/equipment', (route) =>
    route.fulfill({
      json: [
        { id: 1, name: 'Excavator', type: 'Excavator' },
        { id: 2, name: 'Crane', type: 'Crane' },
      ],
    }),
  );
  await page.route('**/api/v1/sites', (route) =>
    route.fulfill({ json: [{ id: 1, name: 'Bridge' }] }),
  );
  await page.route('**/reservations/calendar?**', (route) => {
    const url = new URL(route.request().url());
    const data = events.filter(
      (e) =>
        e.start <= url.searchParams.get('to')! &&
        (!e.end || e.end >= url.searchParams.get('from')!) &&
        (!url.searchParams.has('site_id') ||
          e.site?.id === Number(url.searchParams.get('site_id'))),
    );
    return route.fulfill({ json: data });
  });
});

test('week shows bookings, ongoing maintenance and independent event details', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: '09 Nov 2026 – 15 Nov 2026' })).toBeVisible();
  await page
    .getByRole('button', { name: 'reservation 1 for Excavator on 2026-11-09', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByText('Bridge', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'maintenance 2 for Crane on 2026-11-10', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByText('Ongoing — no end date')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('In progress', { exact: true })).toBeVisible();
});

test('month navigation and filters request the correct period', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('combobox', { name: 'View', exact: true }).click();
  await page.getByRole('option', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('heading', { name: '01 Nov 2026 – 30 Nov 2026' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Equipment type', exact: true }).click();
  await page.getByRole('option', { name: 'Excavator', exact: true }).click();
  await expect(page.getByRole('button', { name: /maintenance 2/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Site', exact: true }).click();
  await page.getByRole('option', { name: 'Bridge', exact: true }).click();
  await expect(
    page.getByText('Maintenance belongs to equipment and is excluded when filtering by site.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByRole('heading', { name: '01 Dec 2026 – 31 Dec 2026' })).toBeVisible();
  await expect(
    page.getByText('No bookings or maintenance match this period and filters.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: '01 Nov 2026 – 30 Nov 2026' })).toBeVisible();
});

test('failed calendar can retry', async ({ page }) => {
  await page.route('**/reservations/calendar?**', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Unavailable' } }),
  );
  await page.goto('/calendar');
  await expect(page.getByText('Calendar could not be loaded.')).toBeVisible();
  await page.route('**/reservations/calendar?**', (route) => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByText('No bookings or maintenance match this period and filters.'),
  ).toBeVisible();
});

test('paginates more than twenty machines and resets on type filter', async ({ page }) => {
  await page.route('**/api/v1/equipment', (route) =>
    route.fulfill({
      json: Array.from({ length: 21 }, (_, i) => ({
        id: i + 1,
        name: `Machine ${i + 1}`,
        type: 'Excavator',
      })),
    }),
  );
  await page.goto('/calendar');
  await expect(page.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(
    page.getByRole('rowheader', { name: 'Machine 21 Excavator', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Equipment type', exact: true }).click();
  await page.getByRole('option', { name: 'Excavator', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(21);
});

test('event details support keyboard access and return focus', async ({ page }) => {
  await page.goto('/calendar');
  const event = page.getByRole('button', {
    name: 'reservation 1 for Excavator on 2026-11-09',
    exact: true,
  });
  await event.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(event).toBeFocused();
});
