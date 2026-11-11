import { randomUUID } from 'node:crypto';
import { APIRequestContext, expect, Page } from '@playwright/test';

import type { Role } from '../../src/app/core/role.service';

/**
 * Backend base URL used by specs that set up or verify data through the real API.
 * Override with E2E_API_URL, e.g. http://localhost:8080/api/v1 for the production compose stack.
 */
export const API = process.env['E2E_API_URL'] ?? 'http://localhost:8000/api/v1';

/** A short unique suffix so parallel specs never share records in the seeded database. */
export function uniqueId(prefix = 'E2E'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/**
 * Switches the demo role in the top bar, which opens that role's home page.
 * Subsequent API calls send the role as the X-Role header.
 */
export async function selectRole(page: Page, role: Role): Promise<void> {
  await page.getByTestId('role-switcher').selectOption(role);
  await expect(page.getByTestId('role-switcher')).toHaveValue(role);
}

interface Created {
  id: number;
}

async function post<T>(
  request: APIRequestContext,
  path: string,
  data: object,
  role?: Role,
): Promise<T> {
  const response = await request.post(`${API}${path}`, {
    data,
    headers: role ? { 'X-Role': role } : undefined,
  });
  expect(response.ok(), `POST ${path} → ${response.status()} ${await response.text()}`).toBe(
    true,
  );
  return response.json() as Promise<T>;
}

export function createSite(
  request: APIRequestContext,
  site: { name: string; address: string; budget: number; start_date: string; end_date: string },
): Promise<Created> {
  return post(request, '/sites', site, 'fleet_manager');
}

/** Looks up a site from backend/seed.py by its exact name. */
export async function findSeededSite(request: APIRequestContext, name: string): Promise<Created> {
  const response = await request.get(`${API}/sites`);
  expect(response.ok()).toBe(true);
  const sites: { id: number; name: string }[] = await response.json();
  const site = sites.find((item) => item.name === name);
  expect(site, `seeded site "${name}" (run python seed.py)`).toBeDefined();
  return site!;
}

export function createEquipment(
  request: APIRequestContext,
  equipment: { name: string; type: string; serial_no: string; hourly_cost: number },
): Promise<Created> {
  return post(request, '/equipment', equipment, 'fleet_manager');
}

/** Creates a reservation as the site manager and approves it as the fleet manager. */
export async function createApprovedReservation(
  request: APIRequestContext,
  booking: { equipment_id: number; site_id: number; start_date: string; end_date: string },
): Promise<Created> {
  const reservation = await post<Created>(request, '/reservations', booking, 'site_manager');
  await post(request, `/reservations/${reservation.id}/approve`, {}, 'fleet_manager');
  return reservation;
}

/** Best-effort cleanup: cancels reservations so they stop counting as bookings. */
export async function cancelReservations(
  request: APIRequestContext,
  ids: (number | undefined)[],
): Promise<void> {
  for (const id of ids) {
    if (id !== undefined) await request.post(`${API}/reservations/${id}/cancel`);
  }
}
