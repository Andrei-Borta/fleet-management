import { OverlayModule } from '@angular/cdk/overlay';
import { Component, computed, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { finalize } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Equipment } from '../equipment/equipment.models';
import { EquipmentService } from '../equipment/equipment.service';
import { Defect, DefectSeverity } from './maintenance.models';
import { MaintenanceService } from './maintenance.service';

@Component({
  selector: 'app-defect-form',
  imports: [
    OverlayModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
    StatusBadge,
  ],
  templateUrl: './defect-form.html',
  styles: `
    .equipment-field mat-form-field { width: 100%; }
    .equipment-trigger { cursor: pointer; }
    .equipment-popover {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-2);
      padding: var(--space-3);
    }
    .equipment-filters {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: var(--space-2);
    }
    .equipment-list { max-height: 16rem; overflow-y: auto; margin-top: var(--space-2); }
    .equipment-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-2);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text);
      text-align: left;
      cursor: pointer;
    }
    .equipment-option:hover, .equipment-option:focus-visible { background: var(--color-surface-alt); }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .description-field {
      grid-column: 1 / -1;
    }
    .form-error {
      color: var(--color-danger);
    }
  `,
})
export class DefectForm {
  private readonly equipmentService = inject(EquipmentService);
  private readonly maintenanceService = inject(MaintenanceService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly equipmentId = input<number | null>(null);
  readonly reported = output<Defect>();
  readonly cancelled = output<void>();

  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);
  protected readonly conflict = signal('');
  protected readonly form = this.fb.group({
    equipment: this.fb.control<Equipment | null>(null, Validators.required),
    description: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(2000),
    ]),
    severity: this.fb.control<DefectSeverity | null>(null, Validators.required),
  });

  protected readonly equipmentDisplay = this.fb.nonNullable.control('', Validators.required);
  protected readonly pickerOpen = signal(false);
  protected readonly search = signal('');
  protected readonly category = signal('');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('equipmentSearch');
  private readonly trigger = viewChild<ElementRef<HTMLInputElement>>('equipmentTrigger');
  protected readonly categories = computed(() =>
    [...new Set(this.equipment().map((item) => item.type))].sort(),
  );
  protected readonly filteredEquipment = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.category();
    return this.equipment().filter((item) =>
      (!category || item.type === category) &&
      `${item.name} ${item.serial_no}`.toLowerCase().includes(query),
    );
  });

  protected openPicker(): void {
    if (!this.equipmentDisplay.disabled) this.pickerOpen.set(true);
  }

  protected focusSearch(): void {
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.equipmentDisplay.markAsTouched();
    this.trigger()?.nativeElement.focus();
  }

  protected selectEquipment(item: Equipment): void {
    this.form.controls.equipment.setValue(item);
    this.equipmentDisplay.setValue(`${item.name} (${item.serial_no})`);
    this.closePicker();
  }

  ngOnInit(): void {
    this.loadEquipment();
  }

  protected loadEquipment(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.equipmentService.list().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (items) => {
        this.equipment.set(items);
        const selected = items.find((item) => item.id === this.equipmentId());
        if (selected) {
          this.form.controls.equipment.setValue(selected);
          this.form.controls.equipment.disable();
          this.equipmentDisplay.setValue(`${selected.name} (${selected.serial_no})`);
          this.equipmentDisplay.disable();
        } else {
          this.form.controls.equipment.enable();
          this.form.controls.equipment.setValue(null);
          this.equipmentDisplay.enable();
          this.equipmentDisplay.setValue('');
        }
      },
      error: () => this.failed.set(true),
    });
  }

  protected submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.equipmentDisplay.markAsTouched();
    const { equipment, description, severity } = this.form.getRawValue();
    if (this.form.invalid || !equipment || severity === null) return;

    this.saving.set(true);
    this.saveFailed.set(false);
    this.conflict.set('');
    this.maintenanceService.reportDefect({ equipment_id: equipment.id, description: description.trim(), severity }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: (defect) => {
        this.notifications.success('Defect reported');
        this.reported.emit(defect);
      },
      error: (error: unknown) => {
        this.saveFailed.set(true);
        this.conflict.set(asConflict(error)?.detail ?? '');
      },
    });
  }
}
