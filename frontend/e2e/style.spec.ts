import { expect, test } from '@playwright/test';

// Guards the shared look & feel from docs/STYLE_GUIDE.md.
const routes = [
  'dashboard',
  'equipment',
  'sites',
  'reservations',
  'calendar',
  'maintenance',
  'operations',
];

test('design tokens are loaded', async ({ page }) => {
  await page.goto('/');
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
  );
  expect(primary.toLowerCase()).toBe('#e0a100');
});

for (const r of routes) {
  test(`${r} uses the page header template`, async ({ page }) => {
    await page.goto(`/${r}`);
    await expect(page.getByTestId('page-title')).toHaveCount(1);
  });
}

test('dark theme toggle switches tokens', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
