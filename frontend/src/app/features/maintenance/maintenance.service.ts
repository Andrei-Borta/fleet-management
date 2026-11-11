import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { Defect, DefectCreate } from './maintenance.models';

@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly http = inject(HttpClient);

  reportDefect(data: DefectCreate) {
    return this.http.post<Defect>(API_URL + '/maintenance/defects', data);
  }
}
