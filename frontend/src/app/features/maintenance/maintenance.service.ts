import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import {
  Defect,
  DefectCreate,
  DueEquipment,
  Intervention,
  InterventionCreate,
  InterventionPartCreate,
  InterventionUpdate,
} from './maintenance.models';

/** API calls of the maintenance module (defects, interventions, service due). */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/maintenance';

  reportDefect(data: DefectCreate) {
    return this.http.post<Defect>(`${this.url}/defects`, data);
  }

  openDefects() {
    return this.http.get<Defect[]>(`${this.url}/defects`, { params: { open: true } });
  }

  interventions() {
    return this.http.get<Intervention[]>(`${this.url}/interventions`);
  }

  createIntervention(data: InterventionCreate) {
    return this.http.post<Intervention>(`${this.url}/interventions`, data);
  }

  updateIntervention(id: number, data: InterventionUpdate) {
    return this.http.patch<Intervention>(`${this.url}/interventions/${id}`, data);
  }

  addPart(id: number, part: InterventionPartCreate) {
    return this.http.post<Intervention>(`${this.url}/interventions/${id}/parts`, part);
  }

  /** Uses the backend defaults (7 days / 50 engine hours). */
  due() {
    return this.http.get<DueEquipment[]>(`${this.url}/due`);
  }
}
