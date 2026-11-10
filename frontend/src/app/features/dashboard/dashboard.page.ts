import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  ChartData,
  ChartOptions,
  DoughnutController,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { finalize } from 'rxjs';

import { ThemeService } from '../../core/theme.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { EquipmentStatus } from '../equipment/equipment.models';
import { FleetPeriod, FleetStats } from './dashboard.models';
import { DashboardService, defaultFleetPeriod } from './dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    PageHeader, StatusBadge, FormsModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatProgressBarModule, BaseChartDirective,
  ],
  providers: [provideCharts({
    registerables: [ArcElement, BarController, BarElement, CategoryScale, DoughnutController, LinearScale, Tooltip],
  })],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview" />

    <form class="filters-bar" (ngSubmit)="applyPeriod()" novalidate>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>From</mat-label>
        <input matInput type="date" name="from" required [ngModel]="from()"
          (ngModelChange)="from.set($event)" [disabled]="loading()" data-testid="period-from" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>To</mat-label>
        <input matInput type="date" name="to" required [ngModel]="to()"
          (ngModelChange)="to.set($event)" [disabled]="loading()" data-testid="period-to" />
      </mat-form-field>
      <button mat-stroked-button type="submit" [disabled]="loading()">Apply period</button>
      @if (periodError()) {
        <p role="alert">{{ periodError() }}</p>
      }
    </form>
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
        <div class="grid charts">
          <section class="card" aria-labelledby="status-heading">
            <h2 id="status-heading">Status distribution</h2>
            @if (data.total_equipment === 0) {
              <div class="empty-state"><p>No equipment to display.</p></div>
            } @else {
              <div class="status-chart"><canvas baseChart [type]="'doughnut'" [data]="statusChart()" [options]="statusOptions" aria-hidden="true"></canvas></div>
              <ul class="status-list" aria-label="Status distribution">
                @for (status of statuses; track status) {
                  <li><app-status-badge [status]="status" /><span class="num">{{ statusCount(status) }}</span></li>
                }
              </ul>
            }
          </section>
          <section class="card" aria-labelledby="utilization-heading">
            <h2 id="utilization-heading">Utilization per equipment</h2>
            @if (data.utilization.length === 0) {
              <div class="empty-state"><p>No active equipment to display.</p></div>
            } @else {
              <div class="utilization-chart"><canvas baseChart [type]="'bar'" [data]="utilizationChart()" [options]="utilizationOptions()" aria-hidden="true"></canvas></div>
              <ul class="utilization-list" aria-label="Equipment utilization">
                @for (item of visibleUtilization(); track item.equipment_id) {
                  <li><span>{{ item.name }}</span> <span class="num">{{ item.utilization_percent }}%</span></li>
                }
              </ul>
              @if (data.utilization.length > pageSize) {
                <div class="chart-pagination">
                  <button mat-stroked-button (click)="page.set(page() - 1)" [disabled]="page() === 0">Previous equipment</button>
                  <span class="text-caption">{{ page() + 1 }} / {{ pageCount() }}</span>
                  <button mat-stroked-button (click)="page.set(page() + 1)" [disabled]="page() + 1 >= pageCount()">Next equipment</button>
                </div>
              }
            }
          </section>
        </div>
      }
    </section>
  `,
  styles: `
    .filters-bar { align-items: center; }
    .filters-bar p { flex-basis: 100%; margin: 0; }
    .charts { margin-top: var(--space-5); align-items: start; }
    .status-chart { height: calc(var(--space-8) * 5); }
    .utilization-chart { height: calc(var(--space-8) * 7); }
    .status-list, .utilization-list { list-style: none; margin: var(--space-4) 0 0; padding: 0; }
    .status-list li, .utilization-list li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
    .chart-pagination { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-2); margin-top: var(--space-4); }
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardService);
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  protected readonly statuses: EquipmentStatus[] = [
    'available', 'reserved', 'in_service', 'defective', 'retired',
  ];
  protected readonly pageSize = 8;
  protected readonly page = signal(0);
  private appliedPeriod: FleetPeriod = defaultFleetPeriod();
  protected readonly from = signal(this.appliedPeriod.from);
  protected readonly to = signal(this.appliedPeriod.to);
  protected readonly periodError = signal('');
  protected readonly fleet = signal<FleetStats | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly visibleUtilization = computed(() =>
    (this.fleet()?.utilization ?? []).slice(
      this.page() * this.pageSize,
      (this.page() + 1) * this.pageSize,
    ),
  );
  protected readonly pageCount = computed(() =>
    Math.ceil((this.fleet()?.utilization.length ?? 0) / this.pageSize),
  );
  protected readonly statusChart = computed<ChartData<'doughnut'>>(() => ({
    labels: ['Available', 'Reserved', 'In service', 'Defective', 'Retired'],
    datasets: [{
      data: this.statuses.map((status) => this.statusCount(status)),
      backgroundColor: this.colors([
        '--status-available-fg', '--status-reserved-fg', '--status-service-fg',
        '--status-defective-fg', '--status-retired-fg',
      ]),
      borderWidth: 0,
    }],
  }));
  protected readonly utilizationChart = computed<ChartData<'bar'>>(() => ({
    labels: this.visibleUtilization().map((item) => item.name),
    datasets: [{
      data: this.visibleUtilization().map((item) => item.utilization_percent),
      backgroundColor: this.colors(['--chart-1'])[0],
      label: 'Utilization',
    }],
  }));
  protected readonly statusOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false, animation: false,
  };
  protected readonly utilizationOptions = computed<ChartOptions<'bar'>>(() => {
    const [text, grid] = this.colors(['--color-text', '--color-border']);
    return {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { min: 0, max: 100, ticks: { color: text, callback: (value) => `${value}%` }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { display: false } },
      },
    };
  });
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

  protected statusCount(status: EquipmentStatus): number {
    return this.fleet()?.by_status.find((item) => item.status === status)?.count ?? 0;
  }

  private colors(tokens: string[]): string[] {
    this.theme.theme();
    const styles = this.document.defaultView?.getComputedStyle(this.document.documentElement);
    return tokens.map((token) => styles?.getPropertyValue(token).trim() ?? '');
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
    this.page.set(0);
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
