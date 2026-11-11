import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { StatusBadge } from '../../shared/status-badge/status-badge';
import { MaintenanceService } from './maintenance.service';
import { DueEquipment } from './maintenance.models';
import { serviceDueRemaining } from './service-due';

/** "Service due soon" section of the maintenance page, from `GET /maintenance/due`. */
@Component({
  selector: 'app-service-due-soon',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink, StatusBadge],
  template: `
    <section class="card" aria-labelledby="service-due-title" [attr.aria-busy]="loading()">
      <h2 id="service-due-title">Service due soon</h2>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading service due" />
      } @else if (failed()) {
        <div class="empty-state">
          <span class="material-symbols-rounded" aria-hidden="true">error</span>
          <p>Service due could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      } @else if (items().length === 0) {
        <div class="empty-state">
          <span class="material-symbols-rounded" aria-hidden="true">event_available</span>
          <p>No machine needs service in the next 7 days or 50 engine hours.</p>
        </div>
      } @else {
        <ul class="due-list">
          @for (item of items(); track item.equipment_id) {
            <li [class.overdue]="item.overdue" data-testid="service-due-item">
              <div>
                <a [routerLink]="['/equipment', item.equipment_id]">{{ item.name }}</a>
                <span class="text-caption">{{ item.type }}</span>
              </div>
              <span class="num">{{ remaining(item) }}</span>
              @if (item.overdue) {
                <span class="text-caption overdue-label">Overdue</span>
              }
              <app-status-badge [status]="item.status" />
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .due-list {
      list-style: none;
      margin: var(--space-3) 0 0;
      padding: 0;
    }
    li {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      border-top: 1px solid var(--color-border);
    }
    li div {
      display: flex;
      flex-direction: column;
    }
    .overdue-label {
      color: var(--color-danger);
      font-weight: 600;
    }
  `,
})
export class ServiceDueSoon {
  private readonly api = inject(MaintenanceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<DueEquipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .due()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => this.failed.set(true),
      });
  }

  protected readonly remaining = serviceDueRemaining;
}
