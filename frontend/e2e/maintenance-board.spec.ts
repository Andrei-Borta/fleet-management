import { expect, Page, Route, test } from '@playwright/test';

// Maintenance board (mechanic view) from issue #27. The API is mocked with an in-memory store.

interface Part {
  id: number;
  intervention_id: number;
  name: string;
  qty: number;
  unit_cost: number;
}

interface Intervention {
  id: number;
  equipment_id: number;
  defect_id: number | null;
  description: string;
  kind: 'repair' | 'revision';
  scheduled_date: string;
  status: 'planned' | 'in_progress' | 'done';
  started_at: string;
  completed_at: string | null;
  labor_hours: number;
  labor_rate: number;
  parts: Part[];
  total_cost: number;
}

const equipment = [
  { id: 1, name: 'CAT 320', type: 'excavator', status: 'defective' },
  { id: 2, name: 'Liebherr crane', type: 'crane', status: 'available' },
];

function withTotal(item: Intervention): Intervention {
  const parts = item.parts.reduce((sum, part) => sum + part.qty * part.unit_cost, 0);
  return { ...item, total_cost: Math.round((parts + item.labor_hours * item.labor_rate) * 100) / 100 };
}

async function mockApi(page: Page) {
  const state = {
    defects: [
      {
        id: 7,
        equipment_id: 1,
        description: 'Hydraulic leak on boom',
        severity: 'critical',
        status: 'open',
        reported_at: '2026-11-10T08:00:00Z',
        resolved_at: null,
      },
    ],
    interventions: [
      withTotal({
        id: 10,
        equipment_id: 2,
        defect_id: null,
        description: '500 h revision',
        kind: 'revision',
        scheduled_date: '2026-11-10',
        status: 'planned',
        started_at: '2026-11-09T08:00:00Z',
        completed_at: null,
        labor_hours: 0,
        labor_rate: 0,
        parts: [],
        total_cost: 0,
      }),
    ] as Intervention[],
    nextId: 11,
    nextPartId: 1,
  };

  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: equipment }));
  await page.route('**/api/v1/maintenance/due*', (route) =>
    route.fulfill({
      json: [
        {
          equipment_id: 2,
          name: 'Liebherr crane',
          type: 'crane',
          status: 'available',
          days_until_due: -2,
          hours_until_due: 12.5,
          overdue: true,
        },
        {
          equipment_id: 1,
          name: 'CAT 320',
          type: 'excavator',
          status: 'defective',
          days_until_due: 5,
          hours_until_due: null,
          overdue: false,
        },
      ],
    }),
  );
  await page.route('**/api/v1/maintenance/defects*', (route) =>
    route.fulfill({ json: state.defects.filter((d) => d.status === 'open') }),
  );
  await page.route('**/api/v1/maintenance/interventions', async (route: Route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: state.interventions });
    }
    const body = route.request().postDataJSON();
    const created = withTotal({
      id: state.nextId++,
      description: '',
      labor_hours: 0,
      labor_rate: 0,
      defect_id: null,
      ...body,
      status: 'planned',
      started_at: '2026-11-11T08:00:00Z',
      completed_at: null,
      parts: [],
      total_cost: 0,
    });
    state.interventions.push(created);
    return route.fulfill({ status: 201, json: created });
  });
  await page.route('**/api/v1/maintenance/interventions/*/parts', async (route) => {
    const id = Number(route.request().url().split('/').at(-2));
    const item = state.interventions.find((i) => i.id === id)!;
    item.parts.push({ id: state.nextPartId++, intervention_id: id, ...route.request().postDataJSON() });
    Object.assign(item, withTotal(item));
    return route.fulfill({ status: 201, json: item });
  });
  await page.route('**/api/v1/maintenance/interventions/*', async (route) => {
    const id = Number(route.request().url().split('/').at(-1));
    const item = state.interventions.find((i) => i.id === id)!;
    const changes = route.request().postDataJSON();
    if (item.status === 'done') {
      return route.fulfill({ status: 409, json: { detail: 'Completed interventions cannot be changed' } });
    }
    Object.assign(item, changes);
    if (changes.status === 'done') {
      item.completed_at = '2026-11-11T12:00:00Z';
      const defect = state.defects.find((d) => d.id === item.defect_id);
      if (defect) defect.status = 'resolved';
    }
    Object.assign(item, withTotal(item));
    return route.fulfill({ json: item });
  });
  return state;
}

const column = (page: Page, status: string) => page.getByTestId(`column-${status}`);

test('lists service due with overdue machines first and links to equipment', async ({ page }) => {
  await mockApi(page);
  await page.goto('/maintenance');

  const due = page.getByTestId('service-due-item');
  await expect(due).toHaveCount(2);
  await expect(due.first()).toContainText('Liebherr crane');
  await expect(due.first()).toContainText('2 days overdue · 12.5 h left');
  await expect(due.first()).toContainText('Overdue');
  await expect(due.nth(1)).toContainText('5 days left');

  await due.first().getByRole('link', { name: 'Liebherr crane' }).click();
  await expect(page).toHaveURL(/\/equipment\/2$/);
});

test('plans a repair from an open defect and moves it through the board', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/maintenance');

  await expect(page.getByTestId('open-defect')).toContainText('Hydraulic leak on boom');
  await page.getByRole('button', { name: 'Plan repair for defect 7' }).click();
  await expect(page.getByText('Repair planned', { exact: true })).toBeVisible();
  await expect(page.getByTestId('open-defect')).toHaveCount(0);

  const planned = column(page, 'planned');
  await expect(planned.getByTestId('intervention-card')).toHaveCount(2);
  const repair = planned.getByTestId('intervention-card').filter({ hasText: 'CAT 320' });
  await expect(repair).toContainText('Repair');
  expect(state.interventions.at(-1)).toMatchObject({ equipment_id: 1, defect_id: 7, kind: 'repair' });

  await page.getByRole('button', { name: 'Start intervention 11' }).click();
  await expect(column(page, 'in_progress').getByTestId('intervention-card')).toContainText('CAT 320');
  await expect(planned.getByTestId('intervention-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Complete intervention 11' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Complete intervention?');
  await dialog.getByRole('button', { name: 'Complete' }).click();
  await expect(column(page, 'done').getByTestId('intervention-card')).toContainText('CAT 320');
  await expect(page.getByRole('button', { name: 'Complete intervention 11' })).toHaveCount(0);
  expect(state.defects[0].status).toBe('resolved');
});

test('adds parts and labour and shows the total cost', async ({ page }) => {
  await mockApi(page);
  await page.goto('/maintenance');

  await page.getByRole('button', { name: 'Parts and labour for intervention 10' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No parts yet.')).toBeVisible();

  await dialog.getByLabel('Part name').fill('Hydraulic hose');
  await dialog.getByLabel('Qty').fill('2');
  await dialog.getByLabel('Unit cost (RON)').fill('150');
  await dialog.getByRole('button', { name: 'Add part' }).click();
  await expect(dialog.getByTestId('parts-table')).toContainText('Hydraulic hose');
  await expect(dialog.getByLabel('Part name')).toHaveValue('');

  await dialog.getByLabel('Hours').fill('3');
  await dialog.getByLabel('Rate (RON/h)').fill('100');
  await dialog.getByRole('button', { name: 'Save labour' }).click();
  await expect(page.getByText('Labour saved')).toBeVisible();
  await expect(dialog.getByTestId('dialog-total')).toContainText('600,00');

  await dialog.getByRole('button', { name: 'Close' }).click();
  const card = column(page, 'planned').getByTestId('intervention-card');
  await expect(card.getByTestId('intervention-total')).toContainText('600,00');
  await expect(card).toContainText('1 part · 3 h labour');
});

test('shows a conflict from the API without leaving the board', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/v1/maintenance/interventions/10', (route) =>
    route.fulfill({ status: 409, json: { detail: 'Cannot start a revision before its scheduled date' } }),
  );
  await page.goto('/maintenance');

  await page.getByRole('button', { name: 'Start intervention 10' }).click();
  await expect(page.getByText('Cannot start a revision before its scheduled date')).toBeVisible();
  await expect(column(page, 'planned').getByTestId('intervention-card')).toHaveCount(1);
});

test('shows empty states and retries a failed load', async ({ page }) => {
  let failBoard = true;
  await page.route('**/api/v1/equipment', (route) => route.fulfill({ json: equipment }));
  await page.route('**/api/v1/maintenance/due*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/maintenance/defects*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/maintenance/interventions', (route) =>
    failBoard
      ? route.fulfill({ status: 500, json: { detail: 'Server error' } })
      : route.fulfill({ json: [] }),
  );
  await page.goto('/maintenance');

  await expect(
    page.getByText('No machine needs service in the next 7 days or 50 engine hours.'),
  ).toBeVisible();
  await expect(page.getByText('Maintenance could not be loaded.')).toBeVisible();

  failBoard = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Every open defect has a repair planned.')).toBeVisible();
  await expect(column(page, 'planned')).toContainText('No interventions.');
});
