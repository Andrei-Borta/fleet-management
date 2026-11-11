import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
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
import { Equipment } from '../equipment/equipment.models';
import { EquipmentService } from '../equipment/equipment.service';
import { Defect, DefectSeverity } from './maintenance.models';
import { MaintenanceService } from './maintenance.service';

@Component({
  selector: 'app-defect-form',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './defect-form.html',
  styles: `
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
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
    equipment_id: this.fb.control<number | null>(null, Validators.required),
    description: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(2000),
    ]),
    severity: this.fb.control<DefectSeverity | null>(null, Validators.required),
  });

  ngOnInit(): void {
    this.form.controls.equipment_id.setValue(this.equipmentId());
    this.loadEquipment();
  }

  protected loadEquipment(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.equipmentService.list().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (items) => this.equipment.set(items),
      error: () => this.failed.set(true),
    });
  }

  protected submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const { equipment_id, description, severity } = this.form.getRawValue();
    if (this.form.invalid || equipment_id === null || severity === null) return;

    this.saving.set(true);
    this.saveFailed.set(false);
    this.conflict.set('');
    this.maintenanceService.reportDefect({ equipment_id, description: description.trim(), severity }).pipe(
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
