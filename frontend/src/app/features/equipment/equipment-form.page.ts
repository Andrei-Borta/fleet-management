import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Equipment, EquipmentCreate, EquipmentWritableStatus } from './equipment.models';
import { EquipmentService } from './equipment.service';

const decimal = Validators.pattern(/^\d{1,10}(\.\d{1,2})?$/);
const nonBlank = Validators.pattern(/\S/);

@Component({
  selector: 'app-equipment-form-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    PageHeader,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
  ],
  templateUrl: './equipment-form.page.html',
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
export class EquipmentFormPage {
  private readonly service = inject(EquipmentService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly original = signal<Equipment | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [
      Validators.required,
      nonBlank,
      Validators.maxLength(200),
    ]),
    type: this.fb.nonNullable.control('', [
      Validators.required,
      nonBlank,
      Validators.maxLength(100),
    ]),
    serial_no: this.fb.nonNullable.control('', [
      Validators.required,
      nonBlank,
      Validators.maxLength(100),
    ]),
    status: this.fb.control<EquipmentWritableStatus>('available'),
    engine_hours: this.fb.control<number>(0, [Validators.required, decimal]),
    hourly_cost: this.fb.control<number | null>(null, [Validators.required, decimal]),
    service_interval_days: this.fb.control<number | null>(null, [
      Validators.pattern(/^\d+$/),
      Validators.min(1),
      Validators.max(2147483647),
    ]),
    service_interval_hours: this.fb.control<number | null>(null, [decimal, Validators.min(0.01)]),
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!this.id) return;
    this.failed.set(false);
    this.loading.set(true);
    this.service
      .get(this.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (equipment) => {
          this.original.set(equipment);
          const status =
            equipment.status === 'available' || equipment.status === 'retired'
              ? equipment.status
              : null;
          this.form.reset({ ...equipment, status });
        },
        error: () => this.failed.set(true),
      });
  }

  protected save(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const values = this.form.getRawValue();
    if (this.form.invalid || values.engine_hours === null || values.hourly_cost === null) return;

    const { status, engine_hours, hourly_cost, ...otherValues } = values;
    const body: EquipmentCreate = {
      ...otherValues,
      name: values.name.trim(),
      type: values.type.trim(),
      serial_no: values.serial_no.trim(),
      engine_hours,
      hourly_cost,
      ...(status ? { status } : {}),
    };
    const original = this.original();
    const changed = Object.fromEntries(
      Object.entries(body).filter(
        ([key, value]) => !original || original[key as keyof EquipmentCreate] !== value,
      ),
    );
    if (this.id && !Object.keys(changed).length) {
      void this.router.navigate(['/equipment', this.id]);
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const request = this.id ? this.service.update(this.id, changed) : this.service.create(body);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (equipment) => {
          this.notifications.success(this.id ? 'Equipment saved' : 'Equipment added');
          void this.router.navigate(['/equipment', equipment.id]);
        },
        error: (error: unknown) => {
          this.saveError.set(asConflict(error)?.detail ?? 'Changes could not be saved.');
        },
      });
  }
}
