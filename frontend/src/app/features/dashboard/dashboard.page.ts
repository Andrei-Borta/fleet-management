import { DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  Plugin,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { finalize } from 'rxjs';

import { RoleService } from '../../core/role.service';
import { ThemeService } from '../../core/theme.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { EquipmentStatus } from '../equipment/equipment.models';
import { FleetPeriod, FleetStats } from './dashboard.models';
import { DashboardService, fleetPeriod, FleetPeriodPreset } from './dashboard.service';
import { PendingRequestsWidget } from './pending-requests.widget';
import { ServiceDueWidget } from './service-due.widget';

const LOAD_ANIMATION_MS = 600;

@Component({
  selector: 'app-dashboard-page',
  imports: [
    PageHeader, StatusBadge, MatButtonModule, MatButtonToggleModule, RouterLink,
    MatProgressBarModule, BaseChartDirective, PendingRequestsWidget, ServiceDueWidget,
  ],
  providers: [provideCharts({
    registerables: [ArcElement, BarController, BarElement, CategoryScale, DoughnutController, LinearScale, Tooltip],
  })],
  template: `
    <app-page-header title="Dashboard" subtitle="Fleet overview">
      <a mat-stroked-button routerLink="/dashboard/costs">Site costs</a>
      @if (roles.can('reservations.request')) {
        <a mat-flat-button routerLink="/reservations/new">New reservation</a>
      }
    </app-page-header>
    <section aria-label="Fleet overview" [attr.aria-busy]="loading()">
      @if (loading() && !fleet()) {
        <div class="card"><mat-progress-bar data-testid="fleet-loading" mode="indeterminate" /></div>
      } @else if (failed() && !fleet()) {
        <div class="card empty-state">
          <p>Fleet availability could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      } @else if (fleet(); as data) {
        <div class="grid" data-testid="fleet-kpis">
          @for (kpi of kpis(); track kpi.label; let index = $index) {
            <div class="kpi" [attr.data-testid]="kpi.testId">
              <span class="material-symbols-rounded kpi-icon" aria-hidden="true">{{ kpi.icon }}</span>
              <div class="kpi-details">
                <span class="text-caption">{{ kpi.label }}</span>
                <span class="text-display num" aria-hidden="true">{{ displayedCounts()[index] }}</span>
                <span class="visually-hidden">{{ kpi.value }}</span>
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
              <div class="status-chart"><canvas baseChart [type]="'doughnut'" [data]="statusChart()" [options]="statusOptions()" aria-hidden="true"></canvas></div>
              <ul class="status-list" aria-label="Status distribution">
                @for (status of statuses; track status) {
                  <li><app-status-badge [status]="status" /><span class="num">{{ statusCount(status) }}</span></li>
                }
              </ul>
            }
          </section>
          <section class="card utilization-card" aria-labelledby="utilization-heading">
            @if (loading()) {
              <mat-progress-bar class="chart-progress" mode="indeterminate" aria-label="Updating utilization" />
            }
            <div class="chart-header">
              <h2 id="utilization-heading">Utilization per equipment</h2>
              <mat-button-toggle-group class="period-toggle" aria-label="Utilization period"
                [value]="preset()" [disabled]="loading()" (change)="selectPeriod($event.value)"
                hideSingleSelectionIndicator>
                <mat-button-toggle value="1m" aria-label="Last 1 month">1M</mat-button-toggle>
                <mat-button-toggle value="3m" aria-label="Last 3 months">3M</mat-button-toggle>
                <mat-button-toggle value="6m" aria-label="Last 6 months">6M</mat-button-toggle>
                <mat-button-toggle value="1y" aria-label="Last 1 year">1Y</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
            @if (failed()) {
              <div class="empty-state">
                <p>Fleet availability could not be loaded. Showing the previous period.</p>
                <button mat-stroked-button (click)="load()">Retry</button>
              </div>
            }
            @if (data.utilization.length === 0) {
              <div class="empty-state"><p>No active equipment to display.</p></div>
            } @else {
              <div class="utilization-chart"><canvas baseChart [type]="'bar'" [data]="utilizationChart()" [options]="utilizationOptions()" [plugins]="utilizationLabels" aria-hidden="true"></canvas></div>
              <ul class="visually-hidden" aria-label="Equipment utilization">
                @for (item of visibleUtilization(); track item.equipment_id) {
                  <li><span>{{ item.name }}</span> <span class="num">{{ item.utilization_percent }}%</span></li>
                }
              </ul>
              @if (data.utilization.length > pageSize) {
                <div class="chart-pagination">
                  <button mat-stroked-button (click)="changePage(-1)" [disabled]="page() === 0"><span class="pagination-label"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span> Previous</span></button>
                  <span class="text-muted num">{{ page() + 1 }} / {{ pageCount() }}</span>
                  <button mat-stroked-button (click)="changePage(1)" [disabled]="page() + 1 >= pageCount()"><span class="pagination-label">Next <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></span></button>
                </div>
              }
            }
          </section>
        </div>
      }
    </section>
    <div class="grid widgets">
      <app-service-due-widget />
      <app-pending-requests-widget />
    </div>
  `,
  styles: `
    .chart-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-4); }
    .chart-header h2 { margin: 0; }
    .period-toggle { --mat-button-toggle-height: var(--space-6); }
    .kpi { flex-direction: row; align-items: center; gap: var(--space-4); }
    .kpi-icon { font-size: var(--space-7); color: var(--color-text-muted); }
    .kpi-details { display: flex; flex-direction: column; gap: var(--space-1); }
    .charts { margin-top: var(--space-5); }
    .widgets { margin-top: var(--space-5); }
    .charts > .card + .card { margin-top: 0; }
    .utilization-card { position: relative; }
    .chart-progress { position: absolute; top: 0; left: 0; right: 0; }
    .status-chart { height: calc(var(--space-8) * 5); }
    .utilization-chart { height: calc(var(--space-8) * 7); }
    .status-list { list-style: none; margin: var(--space-4) 0 0; padding: 0; }
    .status-list li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    .chart-pagination { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-2); margin-top: var(--space-4); }
    .chart-pagination button { --mat-button-outlined-container-height: var(--space-6); --mat-button-outlined-horizontal-padding: var(--space-3); }
    .pagination-label { display: inline-flex; align-items: center; gap: var(--space-1); }
    .pagination-label .material-symbols-rounded { font-size: var(--space-4); }
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardService);
  protected readonly roles = inject(RoleService);
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reducedMotion = signal(true);
  private readonly animateCharts = signal(false);
  private readonly animateUtilization = signal(false);
  private firstLoad = true;
  private periodChanged = false;
  private frameId: number | undefined;
  private animationTimer: number | undefined;
  protected readonly displayedCounts = signal<number[]>([]);
  protected readonly statuses: EquipmentStatus[] = [
    'available', 'reserved', 'in_service', 'defective', 'retired',
  ];
  protected readonly pageSize = 8;
  protected readonly page = signal(0);
  protected readonly preset = signal<FleetPeriodPreset>('1m');
  private appliedPeriod: FleetPeriod = fleetPeriod('1m');
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
  protected readonly statusOptions = computed<ChartOptions<'doughnut'>>(() => ({
    responsive: true, maintainAspectRatio: false,
    animation: this.chartAnimation(this.animateCharts()),
  }));
  protected readonly utilizationLabels: Plugin<'bar'>[] = [{
    id: 'utilizationLabels',
    afterDatasetsDraw: (chart) => {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = this.colors(['--color-text'])[0];
      ctx.font = this.document.defaultView?.getComputedStyle(chart.canvas).font || ctx.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        const value = chart.scales['x'].getValueForPixel(bar.x) ?? 0;
        const target = chart.data.datasets[0].data[index];
        if (typeof target !== 'number') return;
        const displayed = Math.min(100, Math.max(0, value));
        ctx.fillText(`${Number(displayed.toFixed(2))}%`, chart.width - 4, bar.y);
      });
      ctx.restore();
    },
  }];
  protected readonly utilizationOptions = computed<ChartOptions<'bar'>>(() => {
    const [text, grid] = this.colors(['--color-text', '--color-border']);
    const styles = this.document.defaultView?.getComputedStyle(this.document.body);
    const context = this.document.createElement('canvas').getContext('2d');
    if (context && styles) context.font = styles.font;
    const widestLabel = Math.max(
      0,
      ...this.visibleUtilization().map((item) =>
        context?.measureText(`${item.utilization_percent}%`).width ?? 0,
      ),
    );
    const gap = Number.parseFloat(this.colors(['--space-4'])[0]) || 16;
    return {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      animation: this.chartAnimation(this.animateCharts() || this.animateUtilization()),
      layout: { padding: { right: Math.ceil(widestLabel) + gap + 4 } },
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
    const media = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.set(media?.matches ?? true);
    const onMotionChange = (event: MediaQueryListEvent) => {
      this.reducedMotion.set(event.matches);
      if (event.matches) this.stopAnimation();
    };
    media?.addEventListener('change', onMotionChange);
    this.destroyRef.onDestroy(() => {
      media?.removeEventListener('change', onMotionChange);
      this.stopAnimation();
    });
    this.load();
  }

  private chartAnimation(enabled: boolean): false | { duration: number; easing: 'easeOutCubic' } {
    return enabled && !this.reducedMotion()
      ? { duration: LOAD_ANIMATION_MS, easing: 'easeOutCubic' }
      : false;
  }

  private stopAnimation(): void {
    const view = this.document.defaultView;
    if (this.frameId !== undefined) view?.cancelAnimationFrame(this.frameId);
    if (this.animationTimer !== undefined) view?.clearTimeout(this.animationTimer);
    this.frameId = undefined;
    this.animationTimer = undefined;
    this.animateCharts.set(false);
    this.animateUtilization.set(false);
    this.displayedCounts.set(this.kpis().map((item) => item.value));
  }

  private animateCounts(): void {
    const view = this.document.defaultView;
    const targets = this.kpis().map((item) => item.value);
    if (!view || this.reducedMotion()) {
      this.displayedCounts.set(targets);
      return;
    }
    this.displayedCounts.set(targets.map(() => 0));
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / LOAD_ANIMATION_MS, 1);
      const eased = 1 - (1 - progress) ** 3;
      this.displayedCounts.set(targets.map((value) => Math.round(value * eased)));
      if (progress < 1) this.frameId = view.requestAnimationFrame(tick);
      else this.frameId = undefined;
    };
    this.frameId = view.requestAnimationFrame(tick);
  }

  protected changePage(direction: number): void {
    this.stopAnimation();
    this.page.update((page) => page + direction);
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
    this.stopAnimation();
    this.preset.set(preset);
    this.appliedPeriod = fleetPeriod(preset);
    this.periodChanged = true;
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
        next: (data) => {
          const animatePeriod = !this.firstLoad && this.periodChanged && !this.reducedMotion();
          this.animateUtilization.set(animatePeriod);
          this.fleet.set(data);
          if (this.firstLoad && !this.reducedMotion()) {
            this.animateCharts.set(true);
            this.animateCounts();
          } else {
            this.displayedCounts.set(this.kpis().map((item) => item.value));
          }
          if ((this.firstLoad && !this.reducedMotion()) || animatePeriod) {
            this.animationTimer = this.document.defaultView?.setTimeout(() => {
              this.animateCharts.set(false);
              this.animateUtilization.set(false);
            }, LOAD_ANIMATION_MS + 100);
          }
          this.firstLoad = false;
          this.periodChanged = false;
        },
        error: () => this.failed.set(true),
      });
  }
}
