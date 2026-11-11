import { expect, test } from '@playwright/test';
import type { FleetStats } from '../src/app/features/dashboard/dashboard.models';
import type { EquipmentStatus } from '../src/app/features/equipment/equipment.models';
import type { Reservation } from '../src/app/features/reservations/reservations.models';

test('real API: displays fleet and pending request aggregates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fleetResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/dashboard/fleet?') && response.request().method() === 'GET',
  );
  const pendingResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/reservations' && url.searchParams.get('status') === 'pending';
  });
  const dueResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/maintenance/due' &&
      response.request().method() === 'GET',
  );
  await page.goto('/dashboard');
  const fleet = await fleetResponse;
  const pending = await pendingResponse;
  expect(fleet.ok()).toBeTruthy();
  expect(pending.ok()).toBeTruthy();
  const stats: FleetStats = await fleet.json();
  const requests: Reservation[] = await pending.json();
  await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText(
    String(stats.total_equipment),
  );
  const status = (name: EquipmentStatus) =>
    stats.by_status.find((item) => item.status === name)?.count ?? 0;
  await expect(page.getByTestId('kpi-available').locator('.text-display')).toHaveText(String(status('available')));
  await expect(page.getByTestId('kpi-reserved').locator('.text-display')).toHaveText(String(status('reserved')));
  await expect(page.getByTestId('kpi-service-defective').locator('.text-display')).toHaveText(
    String(status('in_service') + status('defective')),
  );
  const widget = page.getByRole('region', { name: 'Pending requests' });
  if (requests.length === 0) {
    await expect(widget.getByText('No pending requests.')).toBeVisible();
  } else {
    await expect(widget.locator('.text-display')).toHaveText(String(requests.length));
  }
  const dueItems: { name: string }[] = await (await dueResponse).json();
  const dueWidget = page.getByRole('region', { name: 'Service due' });
  if (dueItems.length === 0) {
    await expect(dueWidget).toContainText('No machine needs service');
  } else {
    await expect(dueWidget.getByTestId('dashboard-service-due-item').first()).toContainText(dueItems[0].name);
  }
});
