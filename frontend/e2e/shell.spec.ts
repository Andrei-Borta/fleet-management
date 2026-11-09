import { expect, test } from '@playwright/test';

// App shell behaviour from issue #18: persisted theme and the mobile navigation.

test.describe('theme', () => {
  test('dark theme survives a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to light theme');
  });

  test('switching back to light is remembered too', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-toggle').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('opens from the menu button and closes on a backdrop click', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('nav-toggle');
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });

    await expect(dashboardLink).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('nav-backdrop')).toBeVisible();
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toBeFocused();

    // Click to the right of the 240px nav, on the backdrop.
    await page.getByTestId('nav-backdrop').click({ position: { x: 320, y: 400 } });
    await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(dashboardLink).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('closes with Escape and returns focus to the menu button', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('nav-toggle');

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('closes after choosing a page', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-toggle').click();
    await page.getByRole('link', { name: 'Sites' }).click();

    await expect(page).toHaveURL(/\/sites$/);
    await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
  });
});

test('desktop layout shows the nav without a backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('nav-toggle')).toBeHidden();
  await expect(page.getByTestId('nav-backdrop')).toHaveCount(0);
});
