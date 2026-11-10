import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { SKIP_ERROR_NOTIFICATION } from '../../core/error.interceptor';
import { Intervention } from '../maintenance/maintenance.models';
import { Reservation } from '../reservations/reservations.models';
import { Equipment, EquipmentCreate, EquipmentUpdate } from './equipment.models';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/equipment';

  list() {
    return this.http.get<Equipment[]>(this.url);
  }

  get(id: string) {
    return this.http.get<Equipment>(`${this.url}/${id}`);
  }

  create(data: EquipmentCreate) {
    return this.http.post<Equipment>(this.url, data);
  }

  update(id: string, data: EquipmentUpdate) {
    return this.http.patch<Equipment>(`${this.url}/${id}`, data);
  }

  reservations(id: string) {
    return this.http.get<Reservation[]>(API_URL + '/reservations', {
      params: { equipment_id: id },
    });
  }

  interventions(id: string) {
    // The history tab handles an unavailable endpoint and failures in place.
    return this.http.get<Intervention[]>(API_URL + '/maintenance/interventions', {
      params: { equipment_id: id },
      context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true),
    });
  }
}
