import { expect, Page, test } from '@playwright/test';

// Shared UI (#18) and HTTP error handling (#19), driven through the dev-only /dev/ui-kit page.
// The probe endpoint does not exist on the backend: every response below is mocked.

const PROBE = '**/api/v1/dev/ui-kit-probe';

const errorSnackbar = (page: Page) => page.locator('.snackbar-error');
const successSnackbar = (page: Page) => page.locator('.snackbar-success');

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/ui-kit');
  await expect(page.getByTestId('page-title')).toHaveText('UI kit');
});

test.describe('notifications', () => {
  test('success message closes by itself after about 3 seconds', async ({ page }) => {
    await page.getByTestId('notify-success').click();
    await expect(successSnackbar(page)).toContainText('Sample saved');
    await expect(successSnackbar(page)).toBeHidden({ timeout: 5_000 });
  });

  test('error message stays until dismissed', async ({ page }) => {
    await page.getByTestId('notify-error').click();
    await expect(errorSnackbar(page)).toContainText('Sample could not be saved');

    await page.waitForTimeout(4_000);
    await expect(errorSnackbar(page)).toBeVisible();

    await errorSnackbar(page).getByRole('button', { name: 'Dismiss' }).click();
    await expect(errorSnackbar(page)).toBeHidden();
  });
});

test.describe('confirm dialog', () => {
  test('cancel keeps the item', async ({ page }) => {
    await page.getByTestId('delete-sample').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete sample?' })).toBeVisible();
    await expect(dialog.getByTestId('confirm-cancel')).toBeFocused();

    await dialog.getByTestId('confirm-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('confirm-result')).toHaveText('Cancelled');
  });

  test('confirm runs the action', async ({ page }) => {
    await page.getByTestId('delete-sample').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('confirm-result')).toHaveText('Confirmed');
  });

  test('Escape counts as cancel', async ({ page }) => {
    await page.getByTestId('delete-sample').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('confirm-result')).toHaveText('Cancelled');
  });
});

test.describe('HTTP error interceptor', () => {
  test('shows the backend detail for a failed request', async ({ page }) => {
    await page.route(PROBE, (route) =>
      route.fulfill({ status: 404, json: { detail: 'Equipment 42 not found' } }),
    );
    await page.getByTestId('probe-request').click();

    await expect(errorSnackbar(page)).toContainText('Equipment 42 not found');
    await expect(page.getByTestId('probe-result')).toHaveText('Request failed');
  });

  test('joins FastAPI validation errors into one readable message', async ({ page }) => {
    await page.route(PROBE, (route) =>
      route.fulfill({
        status: 422,
        json: {
          detail: [
            { loc: ['body', 'end_date'], msg: 'end_date must not be before start_date', type: 'x' },
            {
              loc: ['body', 'budget'],
              msg: 'Input should be greater than or equal to 0',
              type: 'y',
            },
          ],
        },
      }),
    );
    await page.getByTestId('probe-request').click();

    await expect(errorSnackbar(page)).toContainText(
      'end_date: end_date must not be before start_date; budget: Input should be greater than or equal to 0',
    );
  });

  test('uses a fallback message when the body has no detail', async ({ page }) => {
    await page.route(PROBE, (route) =>
      route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' }),
    );
    await page.getByTestId('probe-request').click();
    await expect(errorSnackbar(page)).toContainText('Something went wrong on the server');
  });

  test('reports when the server cannot be reached', async ({ page }) => {
    await page.route(PROBE, (route) => route.abort('connectionrefused'));
    await page.getByTestId('probe-request').click();
    await expect(errorSnackbar(page)).toContainText('Cannot reach the server');
  });

  test('passes 409 conflicts to the page without a snackbar', async ({ page }) => {
    await page.route(PROBE, (route) =>
      route.fulfill({
        status: 409,
        json: {
          detail: 'Equipment is already booked',
          conflicts: [],
          alternatives: [{ id: 2 }, { id: 3 }],
        },
      }),
    );
    await page.getByTestId('probe-request').click();

    await expect(page.getByTestId('probe-result')).toHaveText(
      'Conflict handled by the page: Equipment is already booked (2 alternatives)',
    );
    await expect(errorSnackbar(page)).toHaveCount(0);
  });

  test('409 without alternatives is handled too', async ({ page }) => {
    await page.route(PROBE, (route) =>
      route.fulfill({ status: 409, json: { detail: 'Site has reservations' } }),
    );
    await page.getByTestId('probe-request').click();

    await expect(page.getByTestId('probe-result')).toHaveText(
      'Conflict handled by the page: Site has reservations (0 alternatives)',
    );
    await expect(errorSnackbar(page)).toHaveCount(0);
  });

  test('successful request shows no error and clears the loading bar', async ({ page }) => {
    await page.route(PROBE, (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await page.getByTestId('probe-request').click();

    await expect(page.getByTestId('probe-result')).toHaveText('Request succeeded');
    await expect(page.getByTestId('probe-loading')).toHaveCount(0);
    await expect(errorSnackbar(page)).toHaveCount(0);
  });
});
