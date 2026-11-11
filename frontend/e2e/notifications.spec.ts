import { expect, test } from '@playwright/test';

const notifications = [
  {
    id: 42,
    title: 'Defect reported',
    message: 'A critical defect needs attention.',
    link: '/maintenance',
    created_at: '2026-11-11T09:30:00Z',
    is_read: false,
  },
  {
    id: 43,
    title: 'Reservation approved',
    message: 'The equipment reservation was approved.',
    link: '/reservations',
    created_at: '2026-11-10T09:30:00Z',
    is_read: true,
  },
];

test('notification opens its destination and is marked read', async ({ page }) => {
  let markedRead = false;
  await page.route('**/api/v1/notifications**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: notifications });
      return;
    }
    if (route.request().method() === 'POST') {
      markedRead = true;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  const bell = page.getByTestId('notification-toggle');
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
  await expect(page.getByTestId('notification-count')).toHaveText('1');

  await bell.click();
  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await page.getByTestId('notification-42').click();

  await expect(page).toHaveURL(/\/maintenance$/);
  await expect.poll(() => markedRead).toBe(true);
  await expect(bell).toHaveAccessibleName('Notifications');
  await expect(page.getByTestId('notification-panel')).toHaveCount(0);
});

test('notification feed refreshes with the newly selected role', async ({ page }) => {
  const rolesSeen: string[] = [];
  await page.route('**/api/v1/notifications', async (route) => {
    const role = route.request().headers()['x-role'] ?? '';
    rolesSeen.push(role);
    await route.fulfill({
      json: [
        {
          id: role === 'operator' ? 52 : 51,
          title: role === 'operator' ? 'Operator update' : 'Fleet update',
          message: 'Relevant to the selected role.',
          link: role === 'operator' ? '/operations' : '/dashboard',
          created_at: '2026-11-11T09:30:00Z',
          is_read: false,
        },
      ],
    });
  });

  await page.goto('/');
  await expect.poll(() => rolesSeen).toContain('fleet_manager');
  await page.getByTestId('role-switcher').selectOption('operator');
  await expect(page).toHaveURL(/\/operations$/);
  await expect.poll(() => rolesSeen).toContain('operator');

  await page.getByTestId('notification-toggle').click();
  await expect(page.getByText('Operator update')).toBeVisible();
  await expect(page.getByText('Fleet update')).toHaveCount(0);
});