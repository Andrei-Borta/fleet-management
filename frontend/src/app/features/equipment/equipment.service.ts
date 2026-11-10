import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { Equipment } from './equipment.models';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/equipment';

  list() {
    return this.http.get<Equipment[]>(this.url);
  }
}
