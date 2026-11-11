import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { forkJoin, finalize } from 'rxjs';
import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { RoleService } from '../../core/role.service';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { Reservation } from './reservations.models';
import { ReservationsService } from './reservations.service';

@Component({
  selector: 'app-reservations-page',
  imports: [
    MatTooltipModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
    MatPaginatorModule,
    MatProgressBarModule,
    RouterLink,
    PageHeader,
    StatusBadge,
  ],
  templateUrl: './reservations.page.html',
  styleUrl: './reservations.page.scss',
})
export class ReservationsPage {
  private readonly api = inject(ReservationsService);
  private readonly feedback = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  protected readonly roles = inject(RoleService);
  protected readonly items = signal<Reservation[]>([]);
  protected readonly sites = signal<Site[]>([]);
  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly message = signal('');
  protected readonly busy = signal<number | null>(null);
  protected readonly tab = signal(0);
  protected readonly site = signal<number | null>(null);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly columns = ['equipment', 'site', 'dates', 'status', 'actions'];
  protected readonly filtered = computed(() =>
    this.items().filter(
      (r) =>
        (this.tab() === 2 || r.status === (this.tab() === 0 ? 'pending' : 'approved')) &&
        (this.site() === null || r.site_id === this.site()),
    ),
  );
  protected readonly visible = computed(() =>
    this.filtered().slice(
      this.pageIndex() * this.pageSize(),
      (this.pageIndex() + 1) * this.pageSize(),
    ),
  );
  constructor() {
    this.load();
  }
  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({ items: this.api.list(), sites: this.api.sites(), equipment: this.api.equipment() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => {
          this.items.set(data.items);
          this.sites.set(data.sites);
          this.equipment.set(data.equipment);
          this.pageIndex.set(0);
        },
        error: () => this.failed.set(true),
      });
  }
  protected equipmentName(id: number): string {
    return this.equipment().find((e) => e.id === id)?.name ?? `Equipment #${id}`;
  }
  protected siteName(id: number): string {
    return this.sites().find((s) => s.id === id)?.name ?? `Site #${id}`;
  }
  protected canCancel(r: Reservation): boolean {
    // The MVP identifies request ownership by role, not by individual user.
    return (
      this.roles.role() === 'site_manager' &&
      r.requested_by_role === 'site_manager' &&
      r.status === 'pending'
    );
  }
  protected act(r: Reservation, action: 'approve' | 'reject' | 'cancel'): void {
    if (
      this.busy() !== null ||
      (action === 'cancel'
        ? !this.canCancel(r)
        : !this.roles.can('reservations.decide') || r.status !== 'pending')
    )
      return;
    if (action === 'approve') {
      this.submit(r, action);
      return;
    }
    this.confirm
      .confirm({
        title: action === 'reject' ? 'Reject reservation?' : 'Cancel reservation?',
        message: `This closes the request for ${this.equipmentName(r.equipment_id)}.`,
        confirmLabel: action === 'reject' ? 'Reject' : 'Cancel reservation',
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) this.submit(r, action);
      });
  }
  private submit(r: Reservation, action: 'approve' | 'reject' | 'cancel'): void {
    // Check permissions again in case the role changed while a dialog was open.
    if (
      this.busy() !== null ||
      (action === 'cancel' ? !this.canCancel(r) : !this.roles.can('reservations.decide'))
    )
      return;
    this.busy.set(r.id);
    this.message.set('');
    this.api
      .act(r.id, action)
      .pipe(finalize(() => this.busy.set(null)))
      .subscribe({
        next: (updated) => {
          this.items.update((items) =>
            items.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.pageIndex.set(0);
          this.feedback.success(`Reservation ${updated.status}`);
        },
        error: (error: unknown) => {
          // Other failures already get a snackbar from the error interceptor.
          const conflict = asConflict(error);
          if (conflict) this.message.set(conflict.detail);
          // The request may have changed meanwhile (approved, cancelled, machine blocked).
          this.load();
        },
      });
  }
}
