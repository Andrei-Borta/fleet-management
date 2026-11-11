import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import {
  ChecklistCreate,
  ChecklistRead,
  UsageCreate,
  UsageRead,
  UsageSummaryRead,
} from './operations.models';

/** API calls of the operations module (safety checklists, hours and fuel). */
@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/operations';

  createChecklist(data: ChecklistCreate) {
    return this.http.post<ChecklistRead>(`${this.url}/checklists`, data);
  }

  listUsage() {
    return this.http.get<UsageSummaryRead>(`${this.url}/usage`);
  }

  logUsage(data: UsageCreate) {
    return this.http.post<UsageRead>(`${this.url}/usage`, data);
  }
}
