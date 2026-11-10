import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { toLocalIsoDate } from '../../shared/date-utils';
import { FleetPeriod, FleetStats } from './dashboard.models';

/** The last 30 local calendar days, including today. */
export function defaultFleetPeriod(today = new Date()): FleetPeriod {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - 29);
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
