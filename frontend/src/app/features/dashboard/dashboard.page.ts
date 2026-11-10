import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { finalize } from 'rxjs';

import { PageHeader } from '../../shared/page-header/page-header';
import { EquipmentStatus } from '../equipment/equipment.models';
import { FleetStats } from './dashboard.models';
import { DashboardService, defaultFleetPeriod } from './dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [PageHeader, MatButtonModule, MatProgressBarModule],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview" />

    <section aria-labelledby="fleet-heading" [attr.aria-busy]="loading()">
      <h2 id="fleet-heading">Fleet availability</h2>
      <p class="text-caption">
        Status is a snapshot as of today. Total equipment includes retired equipment.
      </p>
      @if (loading()) {
        <div class="card"><mat-progress-bar data-testid="fleet-loading" mode="indeterminate" /></div>
      } @else if (failed()) {
        <div class="card empty-state">
          <p>Fleet availability could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      } @else if (fleet(); as data) {
        <div class="grid" data-testid="fleet-kpis">
          @for (kpi of kpis(); track kpi.label) {
            <div class="kpi" [attr.data-testid]="kpi.testId">
              <span class="text-caption">{{ kpi.label }}</span>
              <span class="text-display num">{{ kpi.value }}</span>
            </div>
          }
        </div>
        @if (data.total_equipment === 0) {
          <p class="text-muted">No equipment in the fleet yet.</p>
        }
      }
    </section>
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardService);
  protected readonly fleet = signal<FleetStats | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly kpis = computed(() => {
    const data = this.fleet();
    const count = (status: EquipmentStatus) =>
      data?.by_status.find((item) => item.status === status)?.count ?? 0;
    return [
      { label: 'Total equipment', value: data?.total_equipment ?? 0, testId: 'kpi-total' },
      { label: 'Available', value: count('available'), testId: 'kpi-available' },
      { label: 'Reserved', value: count('reserved'), testId: 'kpi-reserved' },
      {
        label: 'In service / defective',
        value: count('in_service') + count('defective'),
        testId: 'kpi-service-defective',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .fleet(defaultFleetPeriod())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.fleet.set(data),
        error: () => this.failed.set(true),
      });
  }
}
