import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { finalize } from 'rxjs';

import { NotificationService } from '../../core/notification.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { Equipment } from '../equipment/equipment.models';
import { EquipmentService } from '../equipment/equipment.service';
import { ChecklistCreate, ChecklistRead } from './operations.models';
import { OperationsService } from './operations.service';

interface SafetyItem {
  id: string;
  name: string;
  critical: boolean;
  ok: boolean | null;
}

const CHECKLIST_ITEMS: SafetyItem[] = [
  { id: 'brakes', name: 'Brakes', critical: true, ok: null },
  { id: 'lights', name: 'Lights and indicators', critical: true, ok: null },
  { id: 'leaks', name: 'Fluid or hydraulic leaks', critical: true, ok: null },
  { id: 'tires', name: 'Tires or tracks', critical: true, ok: null },
  { id: 'horn', name: 'Horn and warning signals', critical: false, ok: null },
  { id: 'mirrors', name: 'Mirrors and visibility', critical: false, ok: null },
];

@Component({
  selector: 'app-operations-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    PageHeader,
  ],
  templateUrl: './operations.page.html',
  styleUrl: './operations.page.scss',
})
export class OperationsPage {
  private readonly equipmentService = inject(EquipmentService);
  private readonly service = inject(OperationsService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly selectedEquipmentId = signal<number | null>(null);
  protected readonly checklistDate = signal(localDate());
  protected readonly items = signal(CHECKLIST_ITEMS.map((item) => ({ ...item })));
  protected readonly submitted = signal<ChecklistRead | null>(null);
  protected readonly criticalFailures = computed(() =>
    this.items().filter((item) => item.critical && item.ok === false),
  );
  protected readonly criticalFailureNames = computed(() =>
    this.criticalFailures()
      .map((item) => item.name)
      .join(', '),
  );
  protected readonly canSubmit = computed(
    () =>
      this.selectedEquipmentId() !== null &&
      Boolean(this.checklistDate()) &&
      this.items().every((item) => item.ok !== null),
  );

  constructor() {
    this.loadEquipment();
  }

  protected loadEquipment(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.equipmentService
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (equipment) => this.equipment.set(equipment.filter((item) => item.status !== 'retired')),
        error: () => this.failed.set(true),
      });
  }

  /** A new machine starts a new checklist, so earlier answers never carry over. */
  protected selectEquipment(id: number): void {
    this.selectedEquipmentId.set(id);
    this.items.set(CHECKLIST_ITEMS.map((item) => ({ ...item })));
    this.submitted.set(null);
  }

  protected setAnswer(id: string, ok: boolean): void {
    this.items.update((items) => items.map((item) => (item.id === id ? { ...item, ok } : item)));
    this.submitted.set(null);
  }

  protected setDate(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.checklistDate.set(target.value);
      this.submitted.set(null);
    }
  }

  protected submit(): void {
    if (this.saving() || !this.canSubmit() || this.submitted()) return;
    const equipmentId = this.selectedEquipmentId();
    if (equipmentId === null) return;

    const payload: ChecklistCreate = {
      equipment_id: equipmentId,
      date: this.checklistDate(),
      items: this.items().map(({ name, ok, critical }) => ({ name, ok: ok === true, critical })),
    };
    this.saving.set(true);
    this.service
      .createChecklist(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (checklist) => {
          this.submitted.set(checklist);
          this.notifications.success('Safety checklist submitted');
        },
        // The error interceptor already reports the failure; the answers stay for a retry.
        error: () => undefined,
      });
  }
}

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
