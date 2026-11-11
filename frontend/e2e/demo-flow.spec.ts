import { expect, test } from '@playwright/test';

import type { FleetStats } from '../src/app/features/dashboard/dashboard.models';
import type { EquipmentStatus } from '../src/app/features/equipment/equipment.models';
import {
  API,
  cancelReservations,
  createApprovedReservation,
  createEquipment,
  createSite,
  findSeededSite,
  selectRole,
  uniqueId,
} from './support/demo';

/**
 * The full demo storyline from docs/DEMO_SCRIPT.md against the real, seeded backend:
 * add equipment → request → conflict → alternative → approve → calendar → defect →
 * auto-block → repair → dashboard and site costs.
 *
 * Records get a unique suffix so the spec can run in parallel with the other specs
 * and repeatedly on the same database. The mechanic's repair is recorded through the
 * API until the maintenance board (#27) has a UI.
 */
test('demo storyline: request, conflict, approval, defect, repair and costs', async ({
  page,
  request,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Pin "today" so the calendar week and date pickers are deterministic.
  await page.clock.install({ time: new Date('2027-02-01T09:00:00Z') });

  const id = uniqueId('Demo');
  const type = `excavator ${id}`;
  const excavatorName = `CAT 320 ${id}`;
  const alternativeName = `Komatsu PC210 ${id}`;
  const site = await createSite(request, {
    name: `Floreasca Tower ${id}`,
    address: 'Calea Floreasca 169, Bucharest',
    budget: 100000,
    start_date: '2026-11-01',
    end_date: '2027-06-30',
  });
  // A seeded site already holds the new excavator during the requested week.
  const rivalSite = await findSeededSite(request, 'A1 Highway Section 4');
  const alternative = await createEquipment(request, {
    name: alternativeName,
    type,
    serial_no: `SN-${id}-ALT`,
    hourly_cost: 180,
  });
  const reservationIds: (number | undefined)[] = [];

  try {
    // Scene 1, fleet manager: dashboard overview → equipment list → add an excavator.
    await page.goto('/dashboard');
    await selectRole(page, 'fleet_manager');
    await expect(page.getByTestId('fleet-kpis')).toBeVisible();
    await page.getByRole('link', { name: 'Equipment', exact: true }).click();
    await page.getByRole('link', { name: 'Add equipment' }).click();
    await expect(page.getByTestId('save-equipment')).toBeEnabled();
    await page.getByRole('textbox', { name: 'Name' }).fill(excavatorName);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(excavatorName);
    await page.getByRole('textbox', { name: 'Type' }).fill(type);
    await page.getByRole('textbox', { name: 'Serial number' }).fill(`SN-${id}`);
    await page.getByRole('spinbutton', { name: 'Engine hours' }).fill('120');
    await page.getByRole('spinbutton', { name: 'Hourly cost (RON)' }).fill('185');
    await page.getByTestId('save-equipment').click();
    await expect(page).toHaveURL(/\/equipment\/\d+$/);
    const excavatorId = Number(page.url().split('/').pop());
    await expect(page.getByText(excavatorName).first()).toBeVisible();

    const rivalBooking = await createApprovedReservation(request, {
      equipment_id: excavatorId,
      site_id: rivalSite.id,
      start_date: '2027-02-01',
      end_date: '2027-02-10',
    });
    reservationIds.push(rivalBooking.id);

    // Scene 2, site manager: request the excavator → conflict → choose an alternative.
    await page.goto(`/sites/${site.id}`);
    await selectRole(page, 'site_manager');
    await page.getByRole('link', { name: 'Reserve equipment' }).click();
    await page.getByLabel('Start date').fill('2027-02-03');
    await page.getByLabel('End date').fill('2027-02-05');
    await page.getByRole('combobox', { name: 'Equipment', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose equipment' });
    await picker.getByRole('textbox', { name: 'Search equipment' }).fill(id);
    await picker.getByRole('button', { name: `${excavatorName} (${type}) Unavailable for these dates` }).click();
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'This equipment is reserved from 01 Feb 2027 to 10 Feb 2027.',
    );
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/reservations') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: `Request ${alternativeName}` }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const reservation: { id: number; equipment_id: number; status: string } =
      await createdResponse.json();
    reservationIds.push(reservation.id);
    expect(reservation).toMatchObject({ equipment_id: alternative.id, status: 'pending' });
    await expect(page.getByText('Request sent')).toBeVisible();

    // Scene 3, fleet manager: approve the request → it shows in the calendar.
    await selectRole(page, 'fleet_manager');
    await page.goto('/reservations');
    await page.getByRole('combobox', { name: 'Site', exact: true }).click();
    await page.getByRole('option', { name: `Floreasca Tower ${id}`, exact: true }).click();
    await page.getByRole('button', { name: `Approve reservation ${reservation.id}`, exact: true }).click();
    await expect(page.getByText('No reservations match these filters.')).toBeVisible();

    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await page.getByRole('combobox', { name: 'Equipment type', exact: true }).click();
    await page.getByRole('option', { name: type, exact: true }).click();
    await page
      .getByRole('button', {
        name: `reservation ${reservation.id} for ${alternativeName} on 2027-02-03`,
        exact: true,
      })
      .click();
    const details = page.getByRole('dialog');
    await expect(details.getByText('Approved', { exact: true })).toBeVisible();
    await expect(details).toContainText(`Floreasca Tower ${id}`);
    await details.getByRole('button', { name: 'Close', exact: true }).click();

    // Scene 4, operator: report a critical defect → the machine is auto-blocked.
    await page.goto(`/equipment/${alternative.id}`);
    await selectRole(page, 'operator');
    await page.getByRole('link', { name: 'Report defect' }).click();
    await page.getByRole('textbox', { name: 'Description' }).fill('Hydraulic leak on the boom');
    await page.getByRole('combobox', { name: 'Severity' }).click();
    await page.getByRole('option', { name: 'Critical' }).click();
    const reported = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/maintenance/defects') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Report defect' }).click();
    const defect: { id: number } = await (await reported).json();
    await expect(page).toHaveURL(new RegExp(`/equipment/${alternative.id}$`));
    await expect(page.getByText('Defective', { exact: true })).toBeVisible();

    const blocked = await request.post(`${API}/reservations`, {
      headers: { 'X-Role': 'site_manager' },
      data: {
        equipment_id: alternative.id,
        site_id: site.id,
        start_date: '2027-03-01',
        end_date: '2027-03-02',
      },
    });
    expect(blocked.status()).toBe(409);

    // Scene 4, mechanic: repair with parts and labour, then close the intervention (API until #27).
    const mechanic = { 'X-Role': 'mechanic' };
    const interventionResponse = await request.post(`${API}/maintenance/interventions`, {
      headers: mechanic,
      data: {
        equipment_id: alternative.id,
        defect_id: defect.id,
        kind: 'repair',
        scheduled_date: '2027-02-04',
        description: 'Replace the boom cylinder seals',
        labor_hours: 2,
        labor_rate: 150,
      },
    });
    expect(interventionResponse.status()).toBe(201);
    const intervention: { id: number } = await interventionResponse.json();
    const interventionUrl = `${API}/maintenance/interventions/${intervention.id}`;
    expect(
      (await request.patch(interventionUrl, { headers: mechanic, data: { status: 'in_progress' } }))
        .ok(),
    ).toBe(true);
    expect(
      (
        await request.post(`${interventionUrl}/parts`, {
          headers: mechanic,
          data: { name: 'Boom cylinder seal kit', qty: 1, unit_cost: 450 },
        })
      ).ok(),
    ).toBe(true);
    const done = await request.patch(interventionUrl, {
      headers: mechanic,
      data: { status: 'done' },
    });
    expect(done.ok()).toBe(true);
    expect(await done.json()).toMatchObject({ status: 'done', total_cost: 750 });

    await page.reload();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();

    // Scene 5, fleet manager: dashboard availability and cost vs. budget.
    await selectRole(page, 'fleet_manager');
    const fleetResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/dashboard/fleet?') &&
        response.request().method() === 'GET',
    );
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    const stats: FleetStats = await (await fleetResponse).json();
    const count = (status: EquipmentStatus) =>
      stats.by_status.find((item) => item.status === status)?.count ?? 0;
    await expect(page.getByTestId('kpi-total').locator('.text-display')).toHaveText(
      String(stats.total_equipment),
    );
    await expect(page.getByTestId('kpi-available').locator('.text-display')).toHaveText(
      String(count('available')),
    );

    await page.getByRole('link', { name: 'Site costs' }).click();
    await page.getByRole('combobox', { name: 'Site', exact: true }).click();
    await page.getByRole('option', { name: `Floreasca Tower ${id}`, exact: true }).click();
    // 3 days × 8 h × 180 RON booking + 750 RON repair = 5,070 RON committed.
    await expect(page.getByRole('cell', { name: '5.070,00 RON', exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: `View costs for Floreasca Tower ${id}`, exact: true })
      .click();
    const breakdown = page.getByTestId('cost-breakdown');
    await expect(breakdown.getByText('4.320,00 RON', { exact: true })).toBeVisible();
    await expect(breakdown.getByText('750,00 RON', { exact: true })).toBeVisible();
  } finally {
    await cancelReservations(request, reservationIds);
    // Equipment, sites and maintenance history are kept; the unique suffix identifies them.
  }
});
