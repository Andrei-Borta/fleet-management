import { expect, Page, test } from '@playwright/test';

import type { Notification } from '../src/app/features/notifications/notifications.models';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:8000/api/v1';

const note = (id: number, title: string, overrides: Partial<Notification> = {}): Notification => ({
  id,
  role: 'fleet_manager',
  title,
  body: `${title} details.`,
  link: '/maintenance',
  created_at: '2026-11-11T09:30:00Z',
  read_at: null,
  ...overrides,
});

const notifications = [
  note(42, 'Defect reported', { body: 'Critical severity: Brake failure' }),
  note(43, 'Reservation approved', {
    link: '/reservations',
    created_at: '2026-11-10T09:30:00Z',
    read_at: '2026-11-10T10:00:00Z',
  }),
];

async function mockFeed(page: Page, items: Notification[]): Promise<string[]> {
  const posts: string[] = [];
  await page.route('**/api/v1/notifications**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: items });
      return;
    }
    const path = new URL(request.url()).pathname;
    posts.push(path);
    if (path.endsWith('/read-all')) {
      await route.fulfill({ json: { marked: items.filter((item) => !item.read_at).length } });
      return;
    }
    const id = Number(path.split('/').at(-2));
    const item = items.find((candidate) => candidate.id === id);
    await route.fulfill({ json: { ...item, read_at: '2026-11-11T10:00:00Z' } });
  });
  return posts;
}

test('notification opens its destination and is marked read', async ({ page }) => {
  const posts = await mockFeed(page, notifications);

  await page.goto('/');
  const bell = page.getByTestId('notification-toggle');
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
  await expect(page.getByTestId('notification-count')).toHaveText('1');

  await bell.click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('notification-42')).toContainText('Critical severity: Brake failure');
  await panel.getByTestId('notification-42').click();

  await expect(page).toHaveURL(/\/maintenance$/);
  await expect.poll(() => posts).toEqual(['/api/v1/notifications/42/read']);
  await expect(bell).toHaveAccessibleName('Notifications');
  await expect(panel).toHaveCount(0);
});

test('mark all as read clears the badge', async ({ page }) => {
  const posts = await mockFeed(page, [
    note(1, 'Service due: CAT D8 Bulldozer', { link: '/equipment/8' }),
    note(2, 'Defect reported'),
  ]);

  await page.goto('/');
  await expect(page.getByTestId('notification-count')).toHaveText('2');
  await page.getByTestId('notification-toggle').click();
  await page.getByTestId('notification-read-all').click();

  await expect(page.getByTestId('notification-count')).toHaveCount(0);
  await expect(page.getByTestId('notification-read-all')).toHaveCount(0);
  expect(posts).toEqual(['/api/v1/notifications/read-all']);
});

test('the panel closes on a click outside it and on Escape', async ({ page }) => {
  await mockFeed(page, notifications);

  await page.goto('/');
  const bell = page.getByTestId('notification-toggle');
  const panel = page.getByTestId('notification-panel');
  await bell.click();
  await panel.getByRole('heading', { name: 'Notifications' }).click();
  await expect(panel).toBeVisible();

  await page.getByRole('heading', { level: 1 }).click();
  await expect(panel).toHaveCount(0);

  await bell.click();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('notification feed refreshes with the newly selected role', async ({ page }) => {
  const rolesSeen: string[] = [];
  await page.route('**/api/v1/notifications', async (route) => {
    const role = route.request().headers()['x-role'] ?? '';
    rolesSeen.push(role);
    const operator = role === 'operator';
    await route.fulfill({
      json: [
        note(operator ? 52 : 51, operator ? 'Operator update' : 'Fleet update', {
          link: operator ? '/operations' : '/dashboard',
        }),
      ],
    });
  });

  await page.goto('/');
  await expect.poll(() => rolesSeen).toContain('fleet_manager');
  await page.getByTestId('role-switcher').selectOption('operator');
  await expect(page).toHaveURL(/\/operations$/);
  await expect.poll(() => rolesSeen).toContain('operator');

  await page.getByTestId('notification-toggle').click();
  await expect(page.getByText('Operator update', { exact: true })).toBeVisible();
  await expect(page.getByText('Fleet update', { exact: true })).toHaveCount(0);
});

test('real API: an approval reaches the site manager bell', async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const site = await (
    await request.post(`${API}/sites`, {
      data: {
        name: `Bell site ${suffix}`,
        address: 'Main Street',
        budget: 100000,
        start_date: '2099-01-01',
        end_date: '2099-12-31',
      },
    })
  ).json();
  const equipment = await (
    await request.post(`${API}/equipment`, {
      data: { name: `Bell loader ${suffix}`, type: 'loader', serial_no: `BELL-${suffix}`, hourly_cost: 100 },
    })
  ).json();
  const reservation = await (
    await request.post(`${API}/reservations`, {
      headers: { 'X-Role': 'site_manager' },
      data: { equipment_id: equipment.id, site_id: site.id, start_date: '2099-03-01', end_date: '2099-03-03' },
    })
  ).json();
  try {
    expect((await request.post(`${API}/reservations/${reservation.id}/approve`)).ok()).toBe(true);

    await page.goto('/');
    await page.getByTestId('role-switcher').selectOption('site_manager');
    await page.getByTestId('notification-toggle').click();
    const item = page
      .getByTestId('notification-panel')
      .getByRole('link')
      .filter({ hasText: `Bell loader ${suffix}` });
    await expect(item).toContainText('Reservation approved');
    await item.click();
    await expect(page).toHaveURL(/\/reservations$/);
  } finally {
    await request.post(`${API}/reservations/${reservation.id}/cancel`);
  }
});
