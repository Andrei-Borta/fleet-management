import { CurrencyPipe, DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { RoleService } from '../../core/role.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Intervention } from '../maintenance/maintenance.models';
import { Reservation } from '../reservations/reservations.models';
import { Equipment } from './equipment.models';
import { EquipmentService } from './equipment.service';

@Component({
  selector: 'app-equipment-detail-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatProgressBarModule,
    MatTabsModule,
    PageHeader,
    RouterLink,
    StatusBadge,
    TitleCasePipe,
  ],
  templateUrl: './equipment-detail.page.html',
  styles: `
    .tab-content {
      padding: var(--space-4) 0;
    }
    dl {
      margin: 0;
      row-gap: var(--space-4);
    }
    dt {
      color: var(--color-text-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-border);
      overflow-wrap: anywhere;
    }
  `,
})
export class EquipmentDetailPage {
  private readonly service = inject(EquipmentService);
  protected readonly roles = inject(RoleService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  protected readonly hasSiteDetails = inject(Router).config.some(
    (route) => route.path === 'sites/:id',
  );

  protected readonly equipment = signal<Equipment | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly reservations = signal<Reservation[] | null>(null);
  protected readonly loadingReservations = signal(false);
  protected readonly reservationsFailed = signal(false);
  protected readonly interventions = signal<Intervention[] | null>(null);
  protected readonly loadingInterventions = signal(false);
  protected readonly interventionsError = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service
      .get(this.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (equipment) => this.equipment.set(equipment),
        error: () => this.failed.set(true),
      });
  }

  protected loadTab(index: number): void {
    if (index === 1 && this.reservations() === null && !this.loadingReservations()) {
      this.loadReservations();
    }
    if (index === 2 && this.interventions() === null && !this.loadingInterventions()) {
      this.loadInterventions();
    }
  }

  protected loadReservations(): void {
    this.loadingReservations.set(true);
    this.reservationsFailed.set(false);
    this.service
      .reservations(this.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingReservations.set(false)),
      )
      .subscribe({
        next: (reservations) => this.reservations.set(reservations),
        error: () => this.reservationsFailed.set(true),
      });
  }

  protected loadInterventions(): void {
    this.loadingInterventions.set(true);
    this.interventionsError.set('');
    this.service
      .interventions(this.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingInterventions.set(false)),
      )
      .subscribe({
        next: (interventions) => this.interventions.set(interventions),
        error: (error: unknown) => {
          const unavailable =
            error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound;
          this.interventionsError.set(
            unavailable
              ? 'Maintenance history is unavailable on this server.'
              : 'Maintenance history could not be loaded.',
          );
        },
      });
  }
}
