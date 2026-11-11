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
  await page.route('**/api/v1/equipment?*', (route) => route.fulfill({ json: [
    { id: 1, name: 'CAT 320', type: 'excavator', status: 'available' },
    { id: 3, name: 'Crane', type: 'crane', status: 'available' },
  ] }));
});

test('sends a request and returns to pending reservations', async ({ page }) => {
  let body: unknown;
  let role: string | undefined;
  await page.route('**/api/v1/reservations', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    body = route.request().postDataJSON();
    role = route.request().headers()['x-role'];
    return route.fulfill({ status: 201, json: { id: 100, ...(body as object), status: 'pending', requested_by_role: role } });
  });
  await page.goto('/reservations/new?site_id=42');
  await page.getByTestId('role-switcher').selectOption('site_manager');
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /CAT 320/ }).click();
  await page.getByLabel('Note (optional)').fill('Deliver early');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page).toHaveURL(/\/reservations$/);
  await expect(page.getByText('Request sent')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
  expect(role).toBe('site_manager');
  expect(body).toEqual({ site_id: 42, equipment_id: 1, start_date: '2026-11-12', end_date: '2026-11-14', note: 'Deliver early' });
});

test('shows a conflict and resubmits the same request with an alternative', async ({ page }) => {
  const requests: { equipment_id: number; site_id: number; start_date: string; end_date: string; note: string }[] = [];
  await page.route('**/api/v1/reservations', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    const body = route.request().postDataJSON();
    requests.push(body);
    if (requests.length === 1) return route.fulfill({ status: 409, json: {
      detail: 'Equipment is already booked',
      conflicts: [
        { kind: 'reservation', id: 99, start_date: '2026-11-10', end_date: '2026-11-20', status: 'approved' },
        { kind: 'maintenance', id: 4, start_date: '2026-11-13', end_date: '2026-11-14', status: 'planned' },
      ],
      alternatives: [{ id: 3, name: 'Crane', type: 'excavator', status: 'available', hourly_cost: 80 }],
    } });
    return route.fulfill({ status: 201, json: { ...body, id: 101, status: 'pending', requested_by_role: 'site_manager' } });
  });
  await page.goto('/reservations/new?site_id=42');
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByLabel('Note (optional)').fill('Morning delivery');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /CAT 320/ }).click();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('alert')).toContainText('This equipment is reserved from 10 Nov 2026 to 20 Nov 2026.');
  await expect(page.getByRole('combobox', { name: 'Site' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Conflicts' })).toContainText('This equipment is reserved');
  await expect(page.getByRole('list', { name: 'Conflicts' })).toContainText('10 Nov 2026');
  await expect(page.getByRole('list', { name: 'Conflicts' })).toContainText('This equipment is in maintenance from 13 Nov 2026 to 14 Nov 2026.');
  await expect(page.getByRole('list', { name: 'Alternative equipment' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Request Crane' }).click();
  await expect(page).toHaveURL(/\/reservations$/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ ...requests[0], equipment_id: 3 });
});

test('keeps the form on repeated conflicts and clears stale suggestions when it changes', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/reservations', (route) => {
    requests++;
    return route.fulfill({ status: 409, json: requests === 1 ? {
      detail: 'Already booked', conflicts: [],
      alternatives: [{ id: 3, name: 'Crane', type: 'excavator', status: 'available', hourly_cost: 80 }],
    } : {
      detail: 'Alternative now unavailable',
      conflicts: [{ kind: 'maintenance', id: 4, start_date: '2026-11-10', end_date: null, status: 'in_progress' }],
      alternatives: [],
    } });
  });
  await page.goto('/reservations/new?site_id=42');
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /CAT 320/ }).click();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await page.getByRole('button', { name: 'Request Crane' }).click();
  await expect(page.getByRole('alert')).toContainText('This equipment is in maintenance since 10 Nov 2026, with no known end date.');
  await expect(page.getByText('No alternatives are available. Choose different equipment or dates.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Equipment', exact: true })).toHaveValue('Crane');
  await expect(page.getByRole('combobox', { name: 'Site' })).toBeDisabled();
  await page.getByLabel('End date').fill('2026-11-15');
  await expect(page.getByRole('heading', { name: 'Equipment unavailable' })).toHaveCount(0);
});

test('prompts for changes on the form when no alternatives exist', async ({ page }) => {
  await page.route('**/api/v1/reservations', (route) => route.fulfill({ status: 409, json: {
    detail: 'Equipment is defective and cannot be reserved', conflicts: [], alternatives: [],
  } }));
  await page.goto('/reservations/new?site_id=42');
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /Broken digger/ }).click();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('alert')).toContainText('Equipment is defective and cannot be reserved');
  await expect(page.getByRole('alert')).toContainText('Choose different equipment or dates.');
  await expect(page.getByRole('combobox', { name: 'Equipment', exact: true })).toHaveValue('Broken digger');
  await expect(page.getByRole('button', { name: 'Edit request' })).toHaveCount(0);
});

test('shows a spinner while sending a request and returns to the form after an error', async ({ page }) => {
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/reservations', async (route) => {
    await pending;
    await route.fulfill({ status: 404, json: { detail: 'Equipment not found' } });
  });
  try {
    await page.goto('/reservations/new?site_id=42');
    await page.getByLabel('Start date').fill('2026-11-12');
    await page.getByLabel('End date').fill('2026-11-14');
    await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
    await page.getByRole('button', { name: /CAT 320/ }).click();
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByRole('progressbar', { name: 'Sending request' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Site' })).toHaveCount(0);
    release();
    await expect(page.getByText('Equipment not found')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit request' })).toBeEnabled();
  } finally {
    release();
  }
});

test('validates required fields and lets the interceptor report failed submissions', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/reservations', (route) => {
    requests++;
    return route.fulfill({ status: 404, json: { detail: 'Equipment not found' } });
  });
  await page.goto('/reservations/new?site_id=42');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Choose equipment.')).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: /CAT 320/ }).click();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Equipment not found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit request' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Equipment unavailable' })).toHaveCount(0);
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

test('shows period availability without preventing an occupied machine selection', async ({ page }) => {
  await page.route('**/api/v1/equipment?*', (route) => route.fulfill({ json: [
    { id: 3, name: 'Crane', type: 'crane', status: 'available' },
  ] }));
  await page.goto('/reservations/new?site_id=42');
  const trigger = page.getByRole('combobox', { name: 'Equipment', exact: true });
  await trigger.click();
  const picker = page.getByRole('dialog', { name: 'Choose equipment' });
  await expect(picker.getByText('Choose a valid date range to check availability.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Start date').fill('2026-11-12');
  const request = page.waitForRequest((r) => r.url().includes('available_from=2026-11-12') && r.url().includes('available_to=2026-11-14'));
  await page.getByLabel('End date').fill('2026-11-14');
  await request;
  await trigger.click();
  const cat = picker.getByRole('button', { name: /CAT 320/ });
  await expect(cat.locator('app-status-badge')).toHaveAttribute('data-status', 'reserved');
  await expect(picker.getByRole('button', { name: /Crane/ }).locator('app-status-badge')).toHaveAttribute('data-status', 'available');
  await expect(picker.getByRole('button', { name: /Broken digger/ }).locator('app-status-badge')).toHaveAttribute('data-status', 'defective');
  await cat.click();
  await expect(trigger).toHaveValue('CAT 320');
});

test('clears stale availability on date changes and retries a failed lookup', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/equipment?*', (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { detail: 'Unavailable' } })
      : route.fulfill({ json: [{ id: 1, name: 'CAT 320', type: 'excavator', status: 'available' }] });
  });
  await page.goto('/reservations/new?site_id=42');
  await page.getByLabel('Start date').fill('2026-11-12');
  await page.getByLabel('End date').fill('2026-11-14');
  const trigger = page.getByRole('combobox', { name: 'Equipment', exact: true });
  await trigger.click();
  const picker = page.getByRole('dialog', { name: 'Choose equipment' });
  await expect(picker.getByText('Availability could not be checked.')).toBeVisible();
  await expect(picker.getByRole('button', { name: /CAT 320/ })).toContainText('Availability unknown');
  await picker.getByRole('button', { name: 'Retry availability' }).click();
  await expect(picker.getByRole('button', { name: /CAT 320/ }).locator('app-status-badge')).toHaveAttribute('data-status', 'available');
  await page.keyboard.press('Escape');
  await page.getByLabel('End date').fill('2026-11-10');
  await trigger.click();
  await expect(picker.getByText('Choose a valid date range to check availability.')).toBeVisible();
  await expect(picker.getByRole('button', { name: /CAT 320/ })).toContainText('Availability unknown');
  expect(requests).toBe(2);
});

test('a late response cannot replace availability for newer dates', async ({ page }) => {
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route('**/api/v1/equipment?*', async (route) => {
    const end = new URL(route.request().url()).searchParams.get('available_to');
    if (end === '2026-11-14') {
      await firstGate;
      await route.fulfill({ json: [] }).catch(() => undefined);
    } else {
      await route.fulfill({ json: [{ id: 1, name: 'CAT 320', type: 'excavator', status: 'available' }] });
    }
  });
  try {
    await page.goto('/reservations/new?site_id=42');
    await page.getByLabel('Start date').fill('2026-11-12');
    const firstRequest = page.waitForRequest((r) => r.url().includes('available_to=2026-11-14'));
    await page.getByLabel('End date').fill('2026-11-14');
    await firstRequest;
    const nextResponse = page.waitForResponse((r) => r.url().includes('available_to=2026-11-15'));
    await page.getByLabel('End date').fill('2026-11-15');
    await nextResponse;
    releaseFirst();
    await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
    const cat = page.getByRole('dialog', { name: 'Choose equipment' }).getByRole('button', { name: /CAT 320/ });
    await expect(cat.locator('app-status-badge')).toHaveAttribute('data-status', 'available');
  } finally {
    releaseFirst();
  }
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
