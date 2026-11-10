import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { addCalendarMonths, toLocalIsoDate } from '../../shared/date-utils';
import { Reservation } from '../reservations/reservations.models';
import { FleetPeriod, FleetStats } from './dashboard.models';

export type FleetPeriodPreset = '1m' | '3m' | '6m' | '1y';

/** An inclusive period ending today; month-based presets use calendar months. */
export function fleetPeriod(preset: FleetPeriodPreset, today = new Date()): FleetPeriod {
  const months = preset === '1m' ? 1 : preset === '3m' ? 3 : preset === '6m' ? 6 : 12;
  const start = addCalendarMonths(today, -months);
  start.setDate(start.getDate() + 1);
  return { from: toLocalIsoDate(start), to: toLocalIsoDate(today) };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  fleet(period: FleetPeriod) {
    return this.http.get<FleetStats>(`${API_URL}/dashboard/fleet`, {
      params: { from: period.from, to: period.to },
    });
  }

  pendingRequests() {
    return this.http.get<Reservation[]>(`${API_URL}/reservations`, {
      params: { status: 'pending' },
    });
  }
}
