import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { finalize } from 'rxjs';

import { PageHeader } from '../../shared/page-header/page-header';
import { EquipmentStatus } from '../equipment/equipment.models';
import { FleetPeriod, FleetStats } from './dashboard.models';
import { DashboardService, defaultFleetPeriod } from './dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [PageHeader, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview" />

    <form class="filters-bar" (ngSubmit)="applyPeriod()" novalidate>
      <mat-form-field appearance="outline">
        <mat-label>From</mat-label>
        <input matInput type="date" name="from" required [ngModel]="from()"
          (ngModelChange)="from.set($event)" [disabled]="loading()" data-testid="period-from" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>To</mat-label>
        <input matInput type="date" name="to" required [ngModel]="to()"
          (ngModelChange)="to.set($event)" [disabled]="loading()" data-testid="period-to" />
      </mat-form-field>
      <button mat-stroked-button type="submit" [disabled]="loading()">Apply period</button>
      @if (periodError()) {
        <p role="alert">{{ periodError() }}</p>
      }
    </form>
    <p class="text-caption">Utilization is approved reservation days divided by days in the selected period, inclusive.</p>

    <section aria-labelledby="fleet-heading" [attr.aria-busy]="loading()">
      <h2 id="fleet-heading">Fleet availability</h2>
      <p class="text-caption">
        Status is a snapshot as of today when today is within the selected period, otherwise as of the period end.
        Total equipment includes retired equipment.
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
  private appliedPeriod: FleetPeriod = defaultFleetPeriod();
  protected readonly from = signal(this.appliedPeriod.from);
  protected readonly to = signal(this.appliedPeriod.to);
  protected readonly periodError = signal('');
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

  protected applyPeriod(): void {
    const from = this.from();
    const to = this.to();
    if (!from || !to) {
      this.periodError.set('Choose both dates.');
      return;
    }
    if (to < from) {
      this.periodError.set('End date must not be before start date.');
      return;
    }
    this.periodError.set('');
    this.appliedPeriod = { from, to };
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .fleet(this.appliedPeriod)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.fleet.set(data),
        error: () => this.failed.set(true),
      });
  }
}
