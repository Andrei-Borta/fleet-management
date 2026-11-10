import { RouterLink } from '@angular/router';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { PageHeader } from '../../shared/page-header/page-header';
import { Status, StatusBadge } from '../../shared/status-badge/status-badge';

/** Placeholder: shows the style guide building blocks until the dashboard issue is done. */
@Component({
  selector: 'app-dashboard-page',
  imports: [PageHeader, StatusBadge, MatButtonModule, RouterLink],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview">
      <a mat-stroked-button routerLink="/dashboard/costs">Site costs</a>
      <button mat-flat-button>New reservation</button>
    </app-page-header>

    <div class="grid">
      @for (k of kpis; track k.label) {
        <div class="kpi">
          <span class="text-caption">{{ k.label }}</span>
          <span class="text-display num">{{ k.value }}</span>
        </div>
      }
    </div>

    <section class="card statuses">
      <h2>Status legend</h2>
      @for (s of statuses; track s) {
        <app-status-badge [status]="s" />
      }
    </section>
  `,
  styles: `
    .statuses {
      margin-top: var(--space-5);
      app-status-badge {
        margin: 0 var(--space-2) var(--space-2) 0;
      }
    }
  `,
})
export class DashboardPage {
  protected readonly kpis = [
    { label: 'Total equipment', value: '—' },
    { label: 'Available', value: '—' },
    { label: 'Reserved', value: '—' },
    { label: 'In service', value: '—' },
  ];
  protected readonly statuses: Status[] = [
    'available',
    'reserved',
    'in_service',
    'defective',
    'retired',
    'pending',
  ];
}
