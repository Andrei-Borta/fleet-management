import { OverlayModule } from '@angular/cdk/overlay';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { dateRangeErrors, stringField } from '../../shared/validators/date-range';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { ReservationsService } from './reservations.service';

@Component({
  selector: 'app-reservation-form-page',
  imports: [
    MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatSelectModule,
    OverlayModule, PageHeader, ReactiveFormsModule, RouterLink, StatusBadge,
  ],
  templateUrl: './reservation-form.page.html',
  styles: `
    .form-grid { row-gap: var(--space-4); }
    .note-field { grid-column: 1 / -1; }
    .form-actions { margin-top: var(--space-4); }
    .form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
    .form-notice { margin-top: 0; }
    .equipment-trigger { cursor: pointer; }
    .equipment-field mat-form-field { width: 100%; }
    .equipment-popover { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); box-shadow: var(--shadow-2); padding: var(--space-3); }
    .equipment-filters { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--space-2); }
    .equipment-list { max-height: calc(var(--space-8) * 5); overflow-y: auto; margin-top: var(--space-2); }
    .equipment-option { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: var(--space-2); text-align: left; padding: var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); cursor: pointer; font: inherit; }
    .equipment-option:hover, .equipment-option:focus-visible { background: var(--color-surface-alt); }
    .equipment-option:disabled { opacity: 0.55; cursor: not-allowed; }
    .equipment-description { min-width: 0; overflow-wrap: anywhere; }
  `,
})
export class ReservationFormPage {
  private readonly api = inject(ReservationsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requestedSite = inject(ActivatedRoute).snapshot.queryParamMap.get('site_id');
  protected readonly sites = signal<Site[]>([]);
  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly invalidSiteLink = signal(false);
  protected readonly pickerOpen = signal(false);
  protected readonly search = signal('');
  protected readonly category = signal('');
  protected readonly selectedEquipment = signal<Equipment | null>(null);
  private readonly equipmentTrigger = viewChild<ElementRef<HTMLInputElement>>('equipmentTrigger');
  private readonly equipmentSearch = viewChild<ElementRef<HTMLInputElement>>('equipmentSearch');
  protected readonly categories = computed(() =>
    [...new Set(this.equipment().map((item) => item.type))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly filteredEquipment = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    const category = this.category();
    return this.equipment().filter((item) =>
      (!category || item.type === category) && item.name.toLocaleLowerCase().includes(search),
    );
  });

  private readonly rangeValidator: ValidatorFn = (group) => {
    const siteId: unknown = group.get('site_id')?.value;
    const site = this.sites().find((item) => item.id === siteId);
    return dateRangeErrors(stringField(group, 'start_date'), stringField(group, 'end_date'),
      site ? { start: site.start_date, end: site.end_date } : undefined);
  };
  protected readonly form = this.fb.group({
    site_id: this.fb.control<number | null>(null, Validators.required),
    start_date: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]),
    end_date: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]),
    equipment_id: this.fb.control<number | null>(null, Validators.required),
    note: this.fb.nonNullable.control(''),
  }, { validators: this.rangeValidator });
  protected readonly dateMatcher: ErrorStateMatcher = {
    isErrorState: (control, parent) => Boolean(
      (control?.invalid || this.form.hasError('dateOrder') || this.form.hasError('outsideBounds')) &&
      (control?.touched || parent?.submitted),
    ),
  };

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({ sites: this.api.sites(), equipment: this.api.equipment() })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ sites, equipment }) => {
          this.sites.set(sites);
          this.equipment.set(equipment);
          if (this.requestedSite !== null) {
            const selected = sites.find((site) => String(site.id) === this.requestedSite);
            this.invalidSiteLink.set(!selected);
            if (selected) {
              this.form.controls.site_id.setValue(selected.id);
              this.form.controls.site_id.disable();
            }
          }
          this.form.updateValueAndValidity();
        },
        error: () => this.failed.set(true),
      });
  }

  protected selectEquipment(item: Equipment): void {
    if (item.status === 'retired') return;
    this.form.controls.equipment_id.setValue(item.id);
    this.form.controls.equipment_id.markAsTouched();
    this.selectedEquipment.set(item);
    this.closePicker();
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.equipmentTrigger()?.nativeElement.focus();
  }

  protected focusSearch(): void {
    queueMicrotask(() => this.equipmentSearch()?.nativeElement.focus());
  }
}
