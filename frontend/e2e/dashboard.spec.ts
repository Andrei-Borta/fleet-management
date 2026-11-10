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
  utilization: [
    { equipment_id: 1, name: 'Excavator', type: 'Excavator', reserved_days: 15, period_days: 30, utilization_percent: 50 },
    { equipment_id: 2, name: 'Loader', type: 'Loader', reserved_days: 0, period_days: 30, utilization_percent: 0 },
  ],
  top_used: [],
  least_used: [],
};

test('shows fleet availability for the last month', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00'));
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('from')).toBe('2026-10-11');
    expect(url.searchParams.get('to')).toBe('2026-11-10');
    await route.fulfill({ json: fleet });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('10');
  await expect(page.getByTestId('kpi-available')).toContainText('3');
  await expect(page.getByTestId('kpi-reserved')).toContainText('2');
  await expect(page.getByTestId('kpi-service-defective')).toContainText('3');
  await expect(page.getByTestId('kpi-total').locator('.material-symbols-rounded')).toHaveText('construction');
  await expect(page.getByTestId('kpi-available').locator('.material-symbols-rounded')).toHaveText('check_circle');
  await expect(page.getByTestId('kpi-reserved').locator('.material-symbols-rounded')).toHaveText('event_available');
  await expect(page.getByTestId('kpi-service-defective').locator('.material-symbols-rounded')).toHaveText('build');
  await expect(page.getByRole('radio', { name: 'Last 1 month' })).toBeChecked();
});

test('selects preset periods ending today, including month-end and leap-year dates', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2024-05-31T12:00:00'));
  const requests: string[] = [];
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${url.searchParams.get('from')}/${url.searchParams.get('to')}`);
    await route.fulfill({ json: { ...fleet, total_equipment: requests.length } });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('1');
  let count = 1;
  for (const [label, expected] of [
    ['Last 3 months', '2024-03-01/2024-05-31'],
    ['Last 6 months', '2023-12-01/2024-05-31'],
    ['Last 1 year', '2023-06-01/2024-05-31'],
    ['Last 1 month', '2024-05-01/2024-05-31'],
  ]) {
    await page.getByRole('radio', { name: label }).click();
    await expect(page.getByRole('radio', { name: label })).toBeChecked();
    count++;
    await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText(String(count));
    expect(requests.at(-1)).toBe(expected);
  }
});

test('shows chart data and updates utilization for the selected period', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    requests++;
    const utilization = requests === 1 ? fleet.utilization : [{ ...fleet.utilization[0], utilization_percent: 75 }];
    await route.fulfill({ json: { ...fleet, utilization } });
  });
  await page.goto('/dashboard');
  const status = page.getByRole('list', { name: 'Status distribution' });
  await expect(status.getByRole('listitem').filter({ hasText: 'Retired' })).toContainText('2');
  const utilization = page.getByRole('list', { name: 'Equipment utilization' });
  await expect(utilization.getByRole('listitem').filter({ hasText: 'Excavator' })).toContainText('50%');
  await expect(utilization.getByRole('listitem').filter({ hasText: 'Loader' })).toContainText('0%');
  await page.getByRole('radio', { name: 'Last 3 months' }).click();
  await expect(utilization.getByRole('listitem')).toHaveCount(1);
  await expect(utilization.getByRole('listitem').first()).toContainText('75%');
  await expect(page.locator('canvas')).toHaveCount(2);
  for (const canvas of await page.locator('canvas').all()) {
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    })).toBe(true);
  }
});

test('animates the first load and only the utilization chart on period changes', async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as typeof window & { kpiFrames: string[]; chartFrames: string[] };
    tracked.kpiFrames = [];
    tracked.chartFrames = [];
    new MutationObserver(() => {
      const value = document.querySelector('[data-testid="kpi-total"] .text-display')?.textContent;
      if (value && tracked.kpiFrames.at(-1) !== value) tracked.kpiFrames.push(value);
    }).observe(document, { childList: true, characterData: true, subtree: true });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('.utilization-chart') && this.textAlign === 'right' && this.textBaseline === 'middle' && Math.abs(x - (this.canvas.clientWidth - 4)) < 1) {
        tracked.chartFrames.push(text);
      }
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  let requests = 0;
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    requests++;
    const utilization = [{ ...fleet.utilization[0], utilization_percent: requests === 1 ? 50 : 75 }];
    await route.fulfill({ json: { ...fleet, total_equipment: requests === 1 ? 1000 : 2000, utilization } });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText('1000');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { chartFrames: string[] }).chartFrames.includes('50%'))).toBe(true);
  const initial = await page.evaluate(() => {
    const tracked = window as typeof window & { kpiFrames: string[]; chartFrames: string[] };
    return { counts: tracked.kpiFrames, chart: tracked.chartFrames };
  });
  expect(initial.counts.some((value) => Number(value) > 0 && Number(value) < 1000)).toBe(true);
  expect(initial.chart.some((value) => parseFloat(value) > 0 && parseFloat(value) < 50)).toBe(true);
  await page.evaluate(() => {
    const tracked = window as typeof window & { kpiFrames: string[]; chartFrames: string[] };
    tracked.kpiFrames = [];
    tracked.chartFrames = [];
  });
  const originalCanvas = await page.locator('.utilization-chart canvas').elementHandle();
  await page.getByRole('radio', { name: 'Last 3 months' }).click();
  await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText('2000');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { chartFrames: string[] }).chartFrames.includes('75%'))).toBe(true);
  await page.waitForTimeout(750);
  const updated = await page.evaluate(() => {
    const tracked = window as typeof window & { kpiFrames: string[]; chartFrames: string[] };
    return { counts: tracked.kpiFrames, chart: tracked.chartFrames };
  });
  expect(updated.counts).toContain('2000');
  expect(updated.counts.every((value) => value === '1000' || value === '2000')).toBe(true);
  expect(updated.chart.some((value) => parseFloat(value) > 50 && parseFloat(value) < 75)).toBe(true);
  expect(await page.locator('.utilization-chart canvas').evaluate((element, previous) => element === previous, originalCanvas)).toBe(true);
});

test('shows final values immediately with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const tracked = window as typeof window & { reducedCounts: string[]; reducedChart: string[] };
    tracked.reducedCounts = [];
    tracked.reducedChart = [];
    new MutationObserver(() => {
      const value = document.querySelector('[data-testid="kpi-total"] .text-display')?.textContent;
      if (value) tracked.reducedCounts.push(value);
    }).observe(document, { childList: true, characterData: true, subtree: true });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('.utilization-chart') && this.textAlign === 'right' && this.textBaseline === 'middle' && Math.abs(x - (this.canvas.clientWidth - 4)) < 1) {
        tracked.reducedChart.push(text);
      }
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.route('**/api/v1/dashboard/fleet?*', (route) =>
    route.fulfill({ json: { ...fleet, total_equipment: 1000 } }),
  );
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText('1000');
  await expect(page.getByTestId('kpi-total').locator('.visually-hidden')).toHaveText('1000');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { reducedChart: string[] }).reducedChart.includes('50%'))).toBe(true);
  const frames = await page.evaluate(() => {
    const tracked = window as typeof window & { reducedCounts: string[]; reducedChart: string[] };
    return { reducedCounts: tracked.reducedCounts, reducedChart: tracked.reducedChart };
  });
  expect(frames.reducedCounts.every((value) => value === '1000')).toBe(true);
  expect(frames.reducedChart.every((value) => value === '50%' || value === '0%')).toBe(true);
});

test('pages through utilization without dropping equipment', async ({ page }) => {
  const utilization = Array.from({ length: 9 }, (_, i) => ({ ...fleet.utilization[0], equipment_id: i + 1, name: `Machine ${i + 1}`, utilization_percent: 99.99 }));
  await page.route('**/api/v1/dashboard/fleet?*', (route) => route.fulfill({ json: { ...fleet, utilization } }));
  await page.goto('/dashboard');
  const list = page.getByRole('list', { name: 'Equipment utilization' });
  await expect(list.getByRole('listitem')).toHaveCount(8);
  await expect(list.getByRole('listitem').first()).toContainText('99.99%');
  const next = page.getByRole('button', { name: 'Next' });
  const nextText = await next.locator('.pagination-label').boundingBox();
  const nextIcon = await next.locator('.material-symbols-rounded').boundingBox();
  expect(nextText).not.toBeNull();
  expect(nextIcon).not.toBeNull();
  expect(Math.abs(nextText!.y + nextText!.height / 2 - (nextIcon!.y + nextIcon!.height / 2))).toBeLessThan(2);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem').first()).toContainText('Machine 9');
  await expect(list.getByRole('listitem').first()).toContainText('99.99%');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(list.getByText('Machine 1', { exact: true })).toHaveCount(1);
});

test('retries the applied period after a failed request', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00'));
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
  await page.getByRole('radio', { name: 'Last 3 months' }).click();
  await expect(page.getByText('Fleet availability could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('kpi-total')).toBeVisible();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests.slice(1)).toEqual(['2026-08-11/2026-11-10', '2026-08-11/2026-11-10']);
});

test('keeps the dashboard visible while the period updates', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route('**/api/v1/dashboard/fleet?*', async (route) => {
    requests++;
    if (requests === 2) await pending;
    await route.fulfill({ json: fleet });
  });
  await page.goto('/dashboard');
  await expect(page.getByTestId('fleet-kpis')).toBeVisible();
  const chart = await page.locator('.utilization-chart canvas').elementHandle();
  await page.getByRole('radio', { name: 'Last 3 months' }).click();
  await expect(page.getByRole('progressbar', { name: 'Updating utilization' })).toBeVisible();
  await expect(page.getByTestId('fleet-kpis')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Status distribution' })).toBeVisible();
  expect(await page.locator('.utilization-chart canvas').evaluate((element, previous) => element === previous, chart)).toBe(true);
  release();
  await expect(page.getByRole('progressbar', { name: 'Updating utilization' })).toHaveCount(0);
});

test('shows zero counts and an empty state for an empty fleet', async ({ page }) => {
  await page.route('**/api/v1/dashboard/fleet?*', (route) =>
    route.fulfill({ json: { ...fleet, total_equipment: 0, by_status: [], utilization: [] } }),
  );
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-total')).toContainText('0');
  await expect(page.getByTestId('kpi-available')).toContainText('0');
  await expect(page.getByText('No equipment in the fleet yet.')).toBeVisible();
  await expect(page.getByText('No equipment to display.')).toBeVisible();
  await expect(page.getByText('No active equipment to display.')).toBeVisible();
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
    const title = await page.getByRole('heading', { name: 'Utilization per equipment' }).boundingBox();
    const toggle = await page.getByRole('radiogroup', { name: 'Utilization period' }).boundingBox();
    expect(title).not.toBeNull();
    expect(toggle).not.toBeNull();
    if (width === 1440) {
      const statusCard = await page.getByRole('region', { name: 'Status distribution' }).boundingBox();
      const utilizationCard = await page.getByRole('region', { name: 'Utilization per equipment' }).boundingBox();
      expect(statusCard).not.toBeNull();
      expect(utilizationCard).not.toBeNull();
      expect(Math.abs(statusCard!.y - utilizationCard!.y)).toBeLessThan(2);
      expect(Math.abs(statusCard!.height - utilizationCard!.height)).toBeLessThan(2);
      expect(toggle!.x).toBeGreaterThan(title!.x + title!.width);
      expect(Math.abs(toggle!.y + toggle!.height / 2 - (title!.y + title!.height / 2))).toBeLessThan(3);
    }
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('kpi-service-defective')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
  });
}
