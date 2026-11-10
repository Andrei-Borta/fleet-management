import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { DashboardService, fleetPeriod, FleetPeriodPreset } from './dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    PageHeader, StatusBadge, MatButtonModule, MatButtonToggleModule,
    MatProgressBarModule, BaseChartDirective,
  ],
  providers: [provideCharts({
    registerables: [ArcElement, BarController, BarElement, CategoryScale, DoughnutController, LinearScale, Tooltip],
  })],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview">
      <mat-button-toggle-group class="period-toggle" aria-label="Utilization period"
        [value]="preset()" [disabled]="loading()" (change)="selectPeriod($event.value)"
        hideSingleSelectionIndicator>
        <mat-button-toggle value="30d">30 days</mat-button-toggle>
        <mat-button-toggle value="3m">3 months</mat-button-toggle>
        <mat-button-toggle value="6m">6 months</mat-button-toggle>
        <mat-button-toggle value="1y">1 year</mat-button-toggle>
      </mat-button-toggle-group>
    </app-page-header>
    <section aria-label="Fleet overview" [attr.aria-busy]="loading()">
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
              <span class="material-symbols-rounded kpi-icon" aria-hidden="true">{{ kpi.icon }}</span>
              <div class="kpi-details">
                <span class="text-caption">{{ kpi.label }}</span>
                <span class="text-display num">{{ kpi.value }}</span>
              </div>
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
    app-page-header { align-items: flex-start; }
    .period-toggle { --mat-button-toggle-height: var(--space-6); }
    .kpi { flex-direction: row; align-items: center; gap: var(--space-4); }
    .kpi-icon { font-size: var(--space-7); color: var(--color-text-muted); }
    .kpi-details { display: flex; flex-direction: column; gap: var(--space-1); }
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
  protected readonly preset = signal<FleetPeriodPreset>('30d');
  private appliedPeriod: FleetPeriod = fleetPeriod('30d');
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
      { label: 'Total equipment', value: data?.total_equipment ?? 0, testId: 'kpi-total', icon: 'construction' },
      { label: 'Available', value: count('available'), testId: 'kpi-available', icon: 'check_circle' },
      { label: 'Reserved', value: count('reserved'), testId: 'kpi-reserved', icon: 'event_available' },
      {
        label: 'In service / defective',
        value: count('in_service') + count('defective'),
        testId: 'kpi-service-defective',
        icon: 'build',
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

  protected selectPeriod(preset: FleetPeriodPreset): void {
    this.preset.set(preset);
    this.appliedPeriod = fleetPeriod(preset);
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
