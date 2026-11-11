import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { SKIP_ERROR_NOTIFICATION } from '../../core/error.interceptor';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { Reservation, ReservationCreate } from './reservations.models';

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);
  list() {
    return this.http.get<Reservation[]>(`${API_URL}/reservations`);
  }
  create(data: ReservationCreate) {
    return this.http.post<Reservation>(`${API_URL}/reservations`, data);
  }
  sites() {
    return this.http.get<Site[]>(`${API_URL}/sites`);
  }
  equipment() {
    return this.http.get<Equipment[]>(`${API_URL}/equipment`);
  }
  availableEquipment(start: string, end: string) {
    return this.http.get<Equipment[]>(`${API_URL}/equipment`, {
      params: { available_from: start, available_to: end },
      context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true),
    });
  }
  act(id: number, action: 'approve' | 'reject' | 'cancel') {
    return this.http.post<Reservation>(`${API_URL}/reservations/${id}/${action}`, {});
  }
}
