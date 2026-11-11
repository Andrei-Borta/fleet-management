import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { RoleService } from '../../core/role.service';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { MaintenanceService } from './maintenance.service';
import { Intervention } from './maintenance.models';

export interface InterventionDialogData {
  intervention: Intervention;
  equipmentName: string;
  /** Called with the updated intervention after every successful change. */
  changed: (intervention: Intervention) => void;
}

/** Parts and labour of one intervention. Read-only once completed or without maintenance.manage. */
@Component({
  selector: 'app-intervention-dialog',
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    StatusBadge,
  ],
  template: `
    <h2 mat-dialog-title>Parts and labour</h2>
    <mat-dialog-content>
      <p class="summary">
        <span>{{ data.equipmentName }} · {{ item().kind === 'repair' ? 'Repair' : 'Revision' }}</span>
        <app-status-badge [status]="item().status" />
      </p>

      <h3>Parts</h3>
      @if (item().parts.length === 0) {
        <p class="text-muted">No parts yet.</p>
      } @else {
        <table class="parts" data-testid="parts-table">
          <thead>
            <tr class="text-caption">
              <th>Part</th>
              <th class="num">Qty</th>
              <th class="num">Unit cost</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            @for (part of item().parts; track part.id) {
              <tr>
                <td>{{ part.name }}</td>
                <td class="num">{{ part.qty }}</td>
                <td class="num">{{ part.unit_cost | currency: 'RON' : 'code' : '1.2-2' : 'ro' }}</td>
                <td class="num">
                  {{ part.qty * part.unit_cost | currency: 'RON' : 'code' : '1.2-2' : 'ro' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (editable()) {
        <form class="row" [formGroup]="partForm" (ngSubmit)="addPart()" data-testid="part-form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Part name</mat-label>
            <input matInput formControlName="name" />
            <mat-error>Enter a part name.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="small">
            <mat-label>Qty</mat-label>
            <input matInput type="number" min="1" step="1" formControlName="qty" />
            <mat-error>Enter a quantity of 1 or more.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="small">
            <mat-label>Unit cost (RON)</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="unit_cost" />
            <mat-error>Enter a unit cost of 0 or more.</mat-error>
          </mat-form-field>
          <button mat-stroked-button type="submit" [disabled]="saving()">Add part</button>
        </form>
      }

      <h3>Labour</h3>
      @if (editable()) {
        <form class="row" [formGroup]="laborForm" (ngSubmit)="saveLabor()" data-testid="labor-form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="small">
            <mat-label>Hours</mat-label>
            <input matInput type="number" min="0" step="0.5" formControlName="labor_hours" />
            <mat-error>Enter 0 or more hours.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="small">
            <mat-label>Rate (RON/h)</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="labor_rate" />
            <mat-error>Enter a rate of 0 or more.</mat-error>
          </mat-form-field>
          <button mat-stroked-button type="submit" [disabled]="saving()">Save labour</button>
        </form>
      } @else {
        <p>
          {{ item().labor_hours }} h ×
          {{ item().labor_rate | currency: 'RON' : 'code' : '1.2-2' : 'ro' }}
        </p>
      }

      <p class="total">
        <span class="text-caption">Total cost</span>
        <span class="num" data-testid="dialog-total">{{
          item().total_cost | currency: 'RON' : 'code' : '1.2-2' : 'ro'
        }}</span>
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    h3 {
      margin: var(--space-4) 0 var(--space-2);
    }
    .parts {
      width: 100%;
      border-collapse: collapse;
      th,
      td {
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--color-border);
        text-align: left;
      }
      .num {
        text-align: right;
      }
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
      mat-form-field {
        flex: 1 1 160px;
      }
      .small {
        flex: 0 1 120px;
      }
    }
    .total {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-top: var(--space-5);
      font-weight: 600;
    }
  `,
})
export class InterventionDialog {
  protected readonly data = inject<InterventionDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(MaintenanceService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly item = signal(this.data.intervention);
  private readonly roles = inject(RoleService);
  protected readonly editable = computed(
    () => this.item().status !== 'done' && this.roles.can('maintenance.manage'),
  );
  protected readonly saving = signal(false);

  protected readonly partForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    qty: [1, [Validators.required, Validators.min(1)]],
    unit_cost: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly laborForm = this.fb.group({
    labor_hours: [this.data.intervention.labor_hours, [Validators.required, Validators.min(0)]],
    labor_rate: [this.data.intervention.labor_rate, [Validators.required, Validators.min(0)]],
  });

  protected addPart(): void {
    if (this.partForm.invalid) {
      this.partForm.markAllAsTouched();
      return;
    }
    const { name, qty, unit_cost } = this.partForm.getRawValue();
    this.save(
      this.api.addPart(this.item().id, { name: name.trim(), qty: Math.trunc(qty), unit_cost }),
      'Part added',
      () => this.partForm.reset({ name: '', qty: 1, unit_cost: 0 }),
    );
  }

  protected saveLabor(): void {
    if (this.laborForm.invalid) {
      this.laborForm.markAllAsTouched();
      return;
    }
    this.save(this.api.updateIntervention(this.item().id, this.laborForm.getRawValue()), 'Labour saved');
  }

  private save(
    request: ReturnType<MaintenanceService['updateIntervention']>,
    message: string,
    after?: () => void,
  ): void {
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.data.changed(updated);
        this.notifications.success(message);
        after?.();
      },
      error: (error: unknown) => {
        const conflict = asConflict(error);
        if (conflict) {
          this.notifications.error(conflict.detail);
        }
      },
    });
  }
}
