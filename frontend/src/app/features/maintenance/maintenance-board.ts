import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { filter, finalize, forkJoin } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { toLocalIsoDate } from '../../shared/date-utils';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { EquipmentService } from '../equipment/equipment.service';
import { InterventionDialog, InterventionDialogData } from './intervention-dialog';
import { MaintenanceService } from './maintenance.service';
import { Defect, Intervention, InterventionStatus } from './maintenance.models';

const COLUMNS: { status: InterventionStatus; title: string }[] = [
  { status: 'planned', title: 'Planned' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'done', title: 'Done' },
];

/** Open defects waiting for a repair, and interventions by status (mechanic view). */
@Component({
  selector: 'app-maintenance-board',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatProgressBarModule,
    RouterLink,
    StatusBadge,
    TitleCasePipe,
  ],
  template: `
    @if (loading()) {
      <section class="card">
        <mat-progress-bar mode="indeterminate" aria-label="Loading maintenance" />
      </section>
    } @else if (failed()) {
      <section class="card">
        <div class="empty-state">
          <span class="material-symbols-rounded" aria-hidden="true">error</span>
          <p>Maintenance could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      </section>
    } @else {
      <section class="card" aria-labelledby="defects-title">
        <h2 id="defects-title">Open defects</h2>
        @if (unplannedDefects().length === 0) {
          <div class="empty-state">
            <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
            <p>Every open defect has a repair planned.</p>
          </div>
        } @else {
          <ul class="defects">
            @for (defect of unplannedDefects(); track defect.id) {
              <li data-testid="open-defect">
                <div>
                  <a [routerLink]="['/equipment', defect.equipment_id]">{{
                    equipmentName(defect.equipment_id)
                  }}</a>
                  <span class="text-caption"
                    >{{ defect.severity | titlecase }} · reported
                    {{ defect.reported_at | date: 'dd MMM yyyy' }}</span
                  >
                  <p>{{ defect.description }}</p>
                </div>
                <button
                  mat-stroked-button
                  [disabled]="busy()"
                  (click)="planRepair(defect)"
                  [attr.aria-label]="'Plan repair for defect ' + defect.id"
                >
                  Plan repair
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <div class="board">
        @for (column of columns; track column.status) {
          <section
            class="card column"
            [attr.aria-labelledby]="'column-' + column.status"
            [attr.data-testid]="'column-' + column.status"
          >
            <h2 [id]="'column-' + column.status">
              {{ column.title }}
              <span class="text-caption">{{ byStatus()[column.status].length }}</span>
            </h2>
            @for (item of byStatus()[column.status]; track item.id) {
              <article class="item" data-testid="intervention-card">
                <header>
                  <a [routerLink]="['/equipment', item.equipment_id]">{{
                    equipmentName(item.equipment_id)
                  }}</a>
                  <app-status-badge [status]="item.status" />
                </header>
                <span class="text-caption"
                  >{{ item.kind === 'repair' ? 'Repair' : 'Revision' }} ·
                  {{ item.scheduled_date | date: 'dd MMM yyyy' }}</span
                >
                @if (item.description) {
                  <p>{{ item.description }}</p>
                }
                <p class="cost">
                  <span class="text-caption"
                    >{{ item.parts.length }} {{ item.parts.length === 1 ? 'part' : 'parts' }} ·
                    {{ item.labor_hours }} h labour</span
                  >
                  <span class="num" data-testid="intervention-total">{{
                    item.total_cost | currency: 'RON' : 'code' : '1.2-2' : 'ro'
                  }}</span>
                </p>
                <div class="actions">
                  <button
                    mat-button
                    (click)="openCosts(item)"
                    [attr.aria-label]="'Parts and labour for intervention ' + item.id"
                  >
                    {{ item.status === 'done' ? 'View costs' : 'Parts and labour' }}
                  </button>
                  @if (item.status === 'planned') {
                    <button
                      mat-stroked-button
                      [disabled]="busy()"
                      (click)="move(item, 'in_progress')"
                      [attr.aria-label]="'Start intervention ' + item.id"
                    >
                      Start
                    </button>
                  } @else if (item.status === 'in_progress') {
                    <button
                      mat-stroked-button
                      [disabled]="busy()"
                      (click)="move(item, 'done')"
                      [attr.aria-label]="'Complete intervention ' + item.id"
                    >
                      Complete
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <p class="text-muted empty">No interventions.</p>
            }
          </section>
        }
      </div>
    }
  `,
  styles: `
    .defects {
      list-style: none;
      margin: var(--space-3) 0 0;
      padding: 0;
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        padding: var(--space-3) 0;
        border-top: 1px solid var(--color-border);
      }
      li div {
        display: flex;
        flex-direction: column;
      }
      p {
        margin: var(--space-1) 0 0;
      }
    }
    .board {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-5);
      margin-top: var(--space-5);
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      h2 {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 0;
      }
    }
    .item {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
      }
      p {
        margin: 0;
      }
    }
    .cost {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      font-weight: 600;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .empty {
      margin: 0;
    }
    @media (max-width: 959px) {
      .board {
        grid-template-columns: 1fr;
      }
      .defects li {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `,
})
export class MaintenanceBoard {
  private readonly api = inject(MaintenanceService);
  private readonly equipment = inject(EquipmentService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = COLUMNS;
  protected readonly interventions = signal<Intervention[]>([]);
  protected readonly defects = signal<Defect[]>([]);
  private readonly names = signal(new Map<number, string>());
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);

  protected readonly byStatus = computed(() => {
    const groups: Record<InterventionStatus, Intervention[]> = {
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const item of this.interventions()) {
      groups[item.status].push(item);
    }
    groups.planned.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    groups.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    return groups;
  });

  /** Open defects with no intervention yet (a completed repair resolves its defect). */
  protected readonly unplannedDefects = computed(() => {
    const planned = new Set(this.interventions().map((item) => item.defect_id));
    return this.defects().filter((defect) => !planned.has(defect.id));
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({
      interventions: this.api.interventions(),
      defects: this.api.openDefects(),
      equipment: this.equipment.list(),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ interventions, defects, equipment }) => {
          this.interventions.set(interventions);
          this.defects.set(defects);
          this.names.set(new Map(equipment.map((item) => [item.id, item.name])));
        },
        error: () => this.failed.set(true),
      });
  }

  protected equipmentName(id: number): string {
    return this.names().get(id) ?? `Equipment #${id}`;
  }

  protected planRepair(defect: Defect): void {
    this.busy.set(true);
    this.api
      .createIntervention({
        equipment_id: defect.equipment_id,
        defect_id: defect.id,
        kind: 'repair',
        scheduled_date: toLocalIsoDate(new Date()),
        description: defect.description,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (created) => {
          this.interventions.update((items) => [...items, created]);
          this.notifications.success('Repair planned');
        },
        error: (error: unknown) => this.showConflict(error),
      });
  }

  protected move(item: Intervention, status: 'in_progress' | 'done'): void {
    if (status === 'in_progress') {
      this.update(item, status, 'Intervention started');
      return;
    }
    this.confirm
      .confirm({
        title: 'Complete intervention?',
        message: 'Parts and labour cannot be changed afterwards.',
        confirmLabel: 'Complete',
      })
      .pipe(filter(Boolean))
      .subscribe(() => this.update(item, status, 'Intervention completed'));
  }

  protected openCosts(item: Intervention): void {
    this.dialog.open<InterventionDialog, InterventionDialogData>(InterventionDialog, {
      data: {
        intervention: item,
        equipmentName: this.equipmentName(item.equipment_id),
        changed: (updated) => this.replace(updated),
      },
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  private update(item: Intervention, status: InterventionStatus, message: string): void {
    this.busy.set(true);
    this.api
      .updateIntervention(item.id, { status })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.replace(updated);
          this.notifications.success(message);
          if (status === 'done') {
            // A completed repair resolves its defect on the server.
            this.api
              .openDefects()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((defects) => this.defects.set(defects));
          }
        },
        error: (error: unknown) => this.showConflict(error),
      });
  }

  private replace(updated: Intervention): void {
    this.interventions.update((items) =>
      items.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  /** 409s are not shown by the interceptor; everything else already was. */
  private showConflict(error: unknown): void {
    const conflict = asConflict(error);
    if (conflict) {
      this.notifications.error(conflict.detail);
    }
  }
}
