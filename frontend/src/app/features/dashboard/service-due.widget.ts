import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { DueEquipment } from '../maintenance/maintenance.models';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { serviceDueRemaining } from '../maintenance/service-due';

/** Rows shown on the dashboard; the maintenance page lists the rest. */
const MAX_ROWS = 5;

/** Machines overdue or due for service soon (`GET /maintenance/due`, 7 days / 50 h). */
@Component({
  selector: 'app-service-due-widget',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  template: `
    <section class="card" aria-labelledby="service-due-heading" [attr.aria-busy]="loading()">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading service due" />
      }
      <h2 id="service-due-heading">Service due</h2>
      @if (failed()) {
        <div class="empty-state">
          <p>Service due could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      } @else if (!loading() && items().length === 0) {
        <div class="empty-state">
          <span class="material-symbols-rounded" aria-hidden="true">event_available</span>
          <p>No machine needs service in the next 7 days or 50 engine hours.</p>
        </div>
      } @else if (!loading()) {
        <ul class="due-list">
          @for (item of shown(); track item.equipment_id) {
            <li [class.overdue]="item.overdue" data-testid="dashboard-service-due-item">
              <span class="machine">
                <a [routerLink]="['/equipment', item.equipment_id]">{{ item.name }}</a>
                <span class="text-caption">{{ item.type }}</span>
              </span>
              <span class="remaining">
                @if (item.overdue) {
                  <span class="overdue-label text-caption">Overdue</span>
                }
                <span class="num text-caption">{{ remaining(item) }}</span>
              </span>
            </li>
          }
        </ul>
        @if (hidden() > 0) {
          <p class="text-caption more">and {{ hidden() }} more</p>
        }
      }
      <a mat-stroked-button routerLink="/maintenance">View maintenance</a>
    </section>
  `,
  styles: `
    :host { display: flex; }
    section { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    section > a { align-self: flex-start; margin-top: auto; }
    .due-list { list-style: none; margin: 0 0 var(--space-4); padding: 0; }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-2) 0;
      border-top: 1px solid var(--color-border);
    }
    .machine { display: flex; flex-direction: column; min-width: 0; }
    .remaining { display: flex; align-items: center; gap: var(--space-2); }
    .overdue-label { color: var(--color-danger); font-weight: 600; }
    .more { margin: calc(-1 * var(--space-2)) 0 var(--space-4); }
  `,
})
export class ServiceDueWidget {
  private readonly api = inject(MaintenanceService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly items = signal<DueEquipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  /** The endpoint already lists overdue machines first. */
  protected readonly shown = computed(() => this.items().slice(0, MAX_ROWS));
  protected readonly hidden = computed(() => Math.max(0, this.items().length - MAX_ROWS));
  protected readonly remaining = serviceDueRemaining;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .due()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => this.failed.set(true),
      });
  }
}
