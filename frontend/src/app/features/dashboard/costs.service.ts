import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../../core/api';
import { SiteCostsReport } from './costs.models';

@Injectable({ providedIn: 'root' })
export class CostsService {
  private readonly http = inject(HttpClient);
  list() {
    return this.http.get<SiteCostsReport>(`${API_URL}/dashboard/costs`);
  }
}
