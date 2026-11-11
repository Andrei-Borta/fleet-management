import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { Equipment } from '../equipment/equipment.models';
import { Reservation } from '../reservations/reservations.models';
import { Site, SiteCreate, SiteUpdate } from './sites.models';

@Injectable({ providedIn: 'root' })
export class SitesService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/sites';

  list() {
    return this.http.get<Site[]>(this.url);
  }

  get(id: string) {
    return this.http.get<Site>(`${this.url}/${id}`);
  }

  create(data: SiteCreate) {
    return this.http.post<Site>(this.url, data);
  }

  update(id: string, data: SiteUpdate) {
    return this.http.patch<Site>(`${this.url}/${id}`, data);
  }

  reservations(id: string) {
    return this.http.get<Reservation[]>(API_URL + '/reservations', {
      params: { site_id: id },
    });
  }

  equipment() {
    return this.http.get<Equipment[]>(API_URL + '/equipment');
  }
}
