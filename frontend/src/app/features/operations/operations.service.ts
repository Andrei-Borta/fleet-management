import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { ChecklistCreate, ChecklistRead } from './operations.models';

@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly http = inject(HttpClient);

  createChecklist(data: ChecklistCreate) {
    return this.http.post<ChecklistRead>(`${API_URL}/operations/checklists`, data);
  }
}