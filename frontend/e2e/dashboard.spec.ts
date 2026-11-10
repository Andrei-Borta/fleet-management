import { expect, test } from '@playwright/test';

const fleet = {
  start_date: '2026-10-12',
  end_date: '2026-11-10',
  period_days: 30,
  total_equipment: 10,
  by_status: [
    { status: 'available', count: 3 },
    { status: 'reserved', count: 2 },
    { status: 'in_service', count: 1 },
    { status: 'defective', count: 2 },
    { status: 'retired', count: 2 },
  ],
  by_type: [],
  utilization: [],
  top_used: [],
  least_used: [],
};

test('shows fleet availability for the last 30 days', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00'));
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('from')).toBe('2026-10-12');
    expect(url.searchParams.get('to')).toBe('2026-11-10');
    await route.fulfill({ json: fleet });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('10');
  await expect(page.getByTestId('kpi-available')).toContainText('3');
  await expect(page.getByTestId('kpi-reserved')).toContainText('2');
  await expect(page.getByTestId('kpi-service-defective')).toContainText('3');
  await expect(page.getByText('Status is a snapshot as of today', { exact: false })).toBeVisible();
  await expect(page.getByTestId('period-from')).toHaveValue('2026-10-12');
  await expect(page.getByTestId('period-to')).toHaveValue('2026-11-10');
});

test('validates and applies a custom inclusive period', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${url.searchParams.get('from')}/${url.searchParams.get('to')}`);
    await route.fulfill({ json: { ...fleet, total_equipment: requests.length } });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('1');
  await page.getByTestId('period-from').fill('2026-06-10');
  await page.getByTestId('period-to').fill('2026-06-01');
  await page.getByRole('button', { name: 'Apply period' }).click();
  await expect(page.getByRole('alert')).toHaveText('End date must not be before start date.');
  expect(requests).toHaveLength(1);
  await page.getByTestId('period-to').fill('');
  await page.getByRole('button', { name: 'Apply period' }).click();
  await expect(page.getByRole('alert')).toHaveText('Choose both dates.');
  expect(requests).toHaveLength(1);
  await page.getByTestId('period-to').fill('2026-06-10');
  await page.getByRole('button', { name: 'Apply period' }).click();
  await expect(page.getByTestId('kpi-total')).toContainText('2');
  expect(requests[1]).toBe('2026-06-10/2026-06-10');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Utilization is approved reservation days', { exact: false })).toBeVisible();
});

test('retries the applied period after a failed request', async ({ page }) => {
  let attempts = 0;
  const requests: string[] = [];
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${url.searchParams.get('from')}/${url.searchParams.get('to')}`);
    attempts++;
    if (attempts === 2) {
      await route.fulfill({ status: 500, json: { detail: 'Unavailable' } });
    } else {
      await route.fulfill({ json: fleet });
    }
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toBeVisible();
  await page.getByTestId('period-from').fill('2026-06-01');
  await page.getByTestId('period-to').fill('2026-06-30');
  await page.getByRole('button', { name: 'Apply period' }).click();
  await expect(page.getByText('Fleet availability could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('kpi-total')).toBeVisible();
  expect(requests.slice(1)).toEqual(['2026-06-01/2026-06-30', '2026-06-01/2026-06-30']);
});

test('shows zero counts and an empty state for an empty fleet', async ({ page }) => {
  await page.route('**/api/v1/dashboard/fleet?*', (route) =>
    route.fulfill({ json: { ...fleet, total_equipment: 0, by_status: [] } }),
  );
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('0');
  await expect(page.getByTestId('kpi-available')).toContainText('0');
  await expect(page.getByText('No equipment in the fleet yet.')).toBeVisible();
});

test('shows loading and retries a failed request', async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  let attempts = 0;
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    attempts++;
    if (attempts === 1) {
      await wait;
      await route.fulfill({ status: 500, json: { detail: 'Unavailable' } });
    } else {
      await route.fulfill({ json: fleet });
    }
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('fleet-loading')).toBeVisible();
  release();
  await expect(page.getByText('Fleet availability could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('kpi-total')).toContainText('10');
});

for (const width of [375, 1440]) {
  test(`fleet cards fit at ${width}px in light and dark mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/v1/dashboard/fleet?*', (route) => route.fulfill({ json: fleet }));
    await page.goto('/dashboard');
    await expect(page.getByTestId('fleet-kpis')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await expect(page.getByTestId('kpi-service-defective')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
  });
}
