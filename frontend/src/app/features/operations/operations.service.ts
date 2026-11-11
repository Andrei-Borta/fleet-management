import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_URL } from '../../core/api';
import { UsageCreate, UsageRead, UsageSummaryRead } from './operations.models';

@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly http = inject(HttpClient);
  private readonly url = API_URL + '/operations/usage';

  list() {
    return this.http.get<UsageSummaryRead>(this.url);
  }

  create(data: UsageCreate) {
    return this.http.post<UsageRead>(this.url, data);
  }
}