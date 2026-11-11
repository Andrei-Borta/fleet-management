import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/sites', (route) => route.fulfill({ json: [{
    id: 42, name: 'North Ring Road', address: 'Road', budget: 1000,
    start_date: '2026-11-01', end_date: '2026-11-30',
  }] }));
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [
    { id: 1, name: 'CAT 320', type: 'excavator', status: 'available' },
    { id: 2, name: 'Broken digger', type: 'excavator', status: 'defective' },
    { id: 3, name: 'Crane', type: 'crane', status: 'available' },
    { id: 4, name: 'Service digger', type: 'excavator', status: 'in_service' },
    { id: 5, name: 'Old digger', type: 'excavator', status: 'retired' },
  ] }));
});

test('opens the reservation route from each entry point', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/api/v1/sites/42', (route) =>
    route.fulfill({
      json: {
        id: 42,
        name: 'North Ring Road',
        address: 'Road',
        budget: 1000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    }),
  );
  await page.route('**/api/v1/reservations?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [] }));

  await page.goto('/sites/42');
  await page.getByRole('link', { name: 'Reserve equipment' }).click();
  await expect(page).toHaveURL(/\/reservations\/new\?site_id=42$/);
  await expect(page.getByRole('heading', { name: 'New reservation' })).toBeVisible();

  for (const path of ['/dashboard', '/reservations']) {
    await page.goto(path);
    await page.getByRole('link', { name: 'New reservation' }).click();
    await expect(page).toHaveURL(/\/reservations\/new$/);
    await expect(page.getByRole('heading', { name: 'New reservation' })).toBeVisible();
  }
});

test('locks the preselected site, validates dates and selects equipment', async ({ page }) => {
  await page.goto('/reservations/new?site_id=42');
  await expect(page.getByRole('combobox', { name: 'Site' })).toContainText('North Ring Road');
  await expect(page.getByRole('combobox', { name: 'Site' })).toBeDisabled();
  await page.getByLabel('Start date').fill('2026-11-15');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByLabel('End date').blur();
  await expect(page.getByText('End date must be on or after the start date.').first()).toBeVisible();
  await page.getByLabel('End date').fill('2026-12-01');
  await page.getByLabel('End date').blur();
  await expect(page.getByText('Dates must be within the site dates.').first()).toBeVisible();
  await page.getByLabel('End date').fill('2026-11-16');
  await expect(page.getByText('Dates must be within the site dates.')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /CAT 320/ }).click();
  await expect(page.getByRole('combobox', { name: 'Equipment', exact: true })).toHaveValue('CAT 320');
});

test('filters equipment and allows choosing defective and in-service machines', async ({ page }) => {
  await page.goto('/reservations/new');
  const trigger = page.getByRole('combobox', { name: 'Equipment', exact: true });
  await trigger.click();
  const picker = page.getByRole('dialog', { name: 'Choose equipment' });
  await expect(picker.getByLabel('Search equipment')).toBeFocused();
  await picker.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'excavator' }).click();
  await expect(picker.getByRole('button', { name: /Crane/ })).toHaveCount(0);
  await picker.getByLabel('Search equipment').fill('digger');
  await expect(picker.getByRole('button', { name: /CAT 320/ })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: /Old digger/ })).toBeDisabled();
  await picker.getByRole('button', { name: /Broken digger/ }).click();
  await expect(trigger).toHaveValue('Broken digger');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await picker.getByRole('button', { name: /Service digger/ }).click();
  await expect(trigger).toHaveValue('Service digger');
  await trigger.click();
  await picker.getByLabel('Search equipment').fill('nothing');
  await expect(picker.getByText('No equipment matches these filters.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('handles an unknown site link and retries a failed load', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/sites', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 500, json: { detail: 'Unavailable' } })
      : route.fulfill({ json: [{ id: 42, name: 'North Ring Road', start_date: '2026-11-01', end_date: '2026-11-30' }] });
  });
  await page.goto('/reservations/new?site_id=999');
  await expect(page.getByText('Reservation form could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('The linked site could not be found. Choose a site below.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Site' })).toBeEnabled();
});

test('arranges form fields and keeps validation errors clear of the next row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reservations/new');
  await expect(page.getByRole('combobox', { name: 'Site' })).toBeEnabled();
  const site = await page.getByRole('combobox', { name: 'Site' }).boundingBox();
  const equipment = await page.getByRole('combobox', { name: 'Equipment', exact: true }).boundingBox();
  const start = await page.getByLabel('Start date').boundingBox();
  const end = await page.getByLabel('End date').boundingBox();
  const note = await page.getByLabel('Note (optional)').boundingBox();
  expect(site && equipment && start && end && note).toBeTruthy();
  if (!site || !equipment || !start || !end || !note) throw new Error('Missing form fields');
  expect(site.y).toBe(equipment.y);
  expect(start.y).toBe(end.y);
  expect(note.width).toBeGreaterThan(site.width + equipment.width);
  await page.getByLabel('Start date').fill('2026-11-15');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByLabel('End date').blur();
  const error = await page.getByText('End date must be on or after the start date.').last().boundingBox();
  const noteAfterError = await page.getByLabel('Note (optional)').boundingBox();
  expect(error && noteAfterError).toBeTruthy();
  if (!error || !noteAfterError) throw new Error('Missing error or note field');
  expect(error.y + error.height).toBeLessThanOrEqual(noteAfterError.y);
});

test('reservation form fits a narrow screen in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/reservations/new?site_id=42');
  await expect(page.getByRole('combobox', { name: 'Site' })).toContainText('North Ring Road');
  await page.getByTestId('theme-toggle').click();
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose equipment' });
  await expect(picker.getByRole('button', { name: /Broken digger/ })).toBeVisible();
  const bounds = await picker.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 375).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('site actions fit on a narrow screen in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route('**/api/v1/sites/42', (route) =>
    route.fulfill({
      json: {
        id: 42,
        name: 'North Ring Road',
        address: 'Road',
        budget: 1000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      },
    }),
  );
  await page.route('**/api/v1/reservations?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: [] }));
  await page.goto('/sites/42');
  await expect(page.getByRole('link', { name: 'Reserve equipment' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
