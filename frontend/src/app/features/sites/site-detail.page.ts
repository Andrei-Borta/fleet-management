import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Reservation } from '../reservations/reservations.models';
import { Site } from './sites.models';
import { SitesService } from './sites.service';

@Component({
  selector: 'app-site-detail-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatProgressBarModule,
    PageHeader,
    RouterLink,
    StatusBadge,
  ],
  templateUrl: './site-detail.page.html',
  styles: `
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
export class SiteDetailPage {
  private readonly service = inject(SitesService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  protected readonly hasEquipmentDetails = inject(Router).config.some(
    (route) => route.path === 'equipment/:id',
  );
  protected readonly site = signal<Site | null>(null);
  protected readonly reservations = signal<Reservation[]>([]);
  private readonly equipmentNames = signal<Map<number, string>>(new Map());
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly loadingReservations = signal(false);
  protected readonly reservationsFailed = signal(false);

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
        next: (site) => {
          this.site.set(site);
          this.loadReservations();
        },
        error: () => this.failed.set(true),
      });
  }

  protected loadReservations(): void {
    this.loadingReservations.set(true);
    this.reservationsFailed.set(false);
    forkJoin({
      reservations: this.service.reservations(this.id),
      equipment: this.service.equipment(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingReservations.set(false)),
      )
      .subscribe({
        next: ({ reservations, equipment }) => {
          this.reservations.set(reservations);
          this.equipmentNames.set(new Map(equipment.map((item) => [item.id, item.name])));
        },
        error: () => this.reservationsFailed.set(true),
      });
  }

  protected equipmentName(id: number): string {
    return this.equipmentNames().get(id) ?? `Equipment #${id}`;
  }
}
