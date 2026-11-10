import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { CalendarEvent } from './calendar.models';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  events(from: string, to: string, site: number | null) {
    return this.http.get<CalendarEvent[]>(`${API_URL}/reservations/calendar`, {
      params: { from, to, ...(site === null ? {} : { site_id: site }) },
    });
  }
  equipment() {
    return this.http.get<Equipment[]>(`${API_URL}/equipment`);
  }
  sites() {
    return this.http.get<Site[]>(`${API_URL}/sites`);
  }
}
