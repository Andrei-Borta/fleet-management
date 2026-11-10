import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { addCalendarMonths, toLocalIsoDate } from '../../shared/date-utils';
import { FleetPeriod, FleetStats } from './dashboard.models';

export type FleetPeriodPreset = '30d' | '3m' | '6m' | '1y';

/** An inclusive period ending today; month-based presets use calendar months. */
export function fleetPeriod(preset: FleetPeriodPreset, today = new Date()): FleetPeriod {
  const start = preset === '30d'
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
    : addCalendarMonths(today, -(preset === '3m' ? 3 : preset === '6m' ? 6 : 12));
  start.setDate(start.getDate() + (preset === '30d' ? -29 : 1));
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
}
