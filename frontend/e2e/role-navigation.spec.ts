import { expect, Page, test } from '@playwright/test';

// Role-based navigation and actions from issue #33.

const navLinks = (page: Page) => page.getByTestId('sidenav').getByRole('link');

/** Nav link names in order. Accessible names skip the aria-hidden icon text. */
async function expectNav(page: Page, names: string[]): Promise<void> {
  await expect(navLinks(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(navLinks(page).nth(index)).toHaveAccessibleName(name);
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

test('fleet manager lands on the dashboard and sees every section', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectNav(page, [
    'Dashboard',
    'Equipment',
    'Sites',
    'Reservations',
    'Calendar',
    'Maintenance',
    'Operations',
  ]);
});

test('mechanic lands on maintenance with a reduced nav', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('role-switcher').selectOption('mechanic');

  await expect(page).toHaveURL(/\/maintenance$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Maintenance' })).toBeVisible();
  await expectNav(page, ['Equipment', 'Calendar', 'Maintenance']);
});

test('operator lands on operations with a reduced nav', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('role-switcher').selectOption('operator');

  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Operations' })).toBeVisible();
  await expectNav(page, [
    'Equipment',
    'Reservations',
    'Calendar',
    'Maintenance',
    'Operations',
  ]);
});

test('site manager stays on the dashboard and only sees request actions', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('role-switcher').selectOption('site_manager');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: 'New reservation' })).toBeVisible();
  await expectNav(page, [
    'Dashboard',
    'Equipment',
    'Sites',
    'Reservations',
    'Calendar',
  ]);

  await navLinks(page).filter({ hasText: 'Reservations' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reservations' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New reservation' })).toBeVisible();

  await navLinks(page).filter({ hasText: 'Sites' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add site' })).toHaveCount(0);

  await navLinks(page).filter({ hasText: 'Equipment' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Equipment' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add equipment' })).toHaveCount(0);
});

test('switching role opens the new role home, even from a page it can see', async ({ page }) => {
  await page.goto('/equipment');
  await expect(page.getByRole('link', { name: 'Add equipment' })).toBeVisible();

  await page.getByTestId('role-switcher').selectOption('site_manager');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('link', { name: 'Equipment', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Add equipment' })).toHaveCount(0);

  await page.getByTestId('role-switcher').selectOption('mechanic');
  await expect(page).toHaveURL(/\/maintenance$/);

  await page.getByTestId('role-switcher').selectOption('fleet_manager');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('switching role leaves a page the new role cannot see', async ({ page }) => {
  await page.goto('/sites');
  await expect(page.getByRole('link', { name: 'Add site' })).toBeVisible();

  await page.getByTestId('role-switcher').selectOption('operator');
  await expect(page).toHaveURL(/\/operations$/);
});

test('the role survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('role-switcher').selectOption('mechanic');
  await expect(page).toHaveURL(/\/maintenance$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/maintenance$/);
  await expect(page.getByTestId('role-switcher')).toHaveValue('mechanic');
  await expectNav(page, ['Equipment', 'Calendar', 'Maintenance']);
});

test('a page outside the role nav redirects to the role home', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fleet.role', 'mechanic'));

  await page.goto('/sites');
  await expect(page).toHaveURL(/\/maintenance$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/maintenance$/);
});

test('a form the role may not use redirects to the role home', async ({ page }) => {
  await page.goto('/sites/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add site' })).toBeVisible();

  await page.getByTestId('role-switcher').selectOption('site_manager');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/sites/new');
  await expect(page).toHaveURL(/\/dashboard$/);
});
