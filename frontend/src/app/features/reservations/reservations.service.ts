import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { Reservation } from './reservations.models';

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);
  list() {
    return this.http.get<Reservation[]>(`${API_URL}/reservations`);
  }
  sites() {
    return this.http.get<Site[]>(`${API_URL}/sites`);
  }
  equipment() {
    return this.http.get<Equipment[]>(`${API_URL}/equipment`);
  }
  act(id: number, action: 'approve' | 'reject' | 'cancel') {
    return this.http.post<Reservation>(`${API_URL}/reservations/${id}/${action}`, {});
  }
}
