import { OverlayModule } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, forkJoin, map, merge, of, startWith, Subject, switchMap } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { dateRangeErrors, stringField } from '../../shared/validators/date-range';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { AlternativeEquipment, ReservationConflictBody, ReservationCreate } from './reservations.models';
import { ReservationsService } from './reservations.service';

@Component({
  selector: 'app-reservation-form-page',
  imports: [
    DatePipe, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatProgressSpinnerModule, MatSelectModule,
    OverlayModule, PageHeader, ReactiveFormsModule, RouterLink, StatusBadge,
  ],
  templateUrl: './reservation-form.page.html',
  styles: `
    .form-grid { row-gap: var(--space-4); }
    .note-field { grid-column: 1 / -1; }
    .form-actions { margin-top: var(--space-4); }
    .form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
    .form-notice { margin-top: 0; }
    .form-conflict { margin-bottom: var(--space-5); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-alt); }
    .form-conflict p { margin: 0; }
    .form-conflict p + p { margin-top: var(--space-2); }
    .equipment-trigger { cursor: pointer; }
    .equipment-field mat-form-field { width: 100%; }
    .equipment-popover { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); box-shadow: var(--shadow-2); padding: var(--space-3); }
    .equipment-filters { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--space-2); }
    .equipment-list { max-height: calc(var(--space-8) * 5); overflow-y: auto; margin-top: var(--space-2); }
    .equipment-option { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: var(--space-2); text-align: left; padding: var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); cursor: pointer; font: inherit; }
    .equipment-option:hover, .equipment-option:focus-visible { background: var(--color-surface-alt); }
    .equipment-option:disabled { opacity: 0.55; cursor: not-allowed; }
    .equipment-description { min-width: 0; overflow-wrap: anywhere; }
    .request-loading { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-6); }
    .conflict h2 { text-align: center; }
    .conflict-list, .conflict-reason { text-align: center; }
    .conflict ul { list-style: none; margin: 0; padding: 0; }
    .conflict-list li + li { margin-top: var(--space-2); }
    .alternatives-heading { margin: var(--space-6) 0 var(--space-4); text-align: center; }
    .alternatives { display: grid; gap: var(--space-3); }
    .alternative { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-alt); }
    .conflict-actions { margin-top: var(--space-5); }
  `,
})
export class ReservationFormPage {
  private readonly api = inject(ReservationsService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requestedSite = inject(ActivatedRoute).snapshot.queryParamMap.get('site_id');
  protected readonly sites = signal<Site[]>([]);
  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly invalidSiteLink = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);
  protected readonly conflict = signal<ReservationConflictBody | null>(null);
  protected readonly pickerOpen = signal(false);
  protected readonly search = signal('');
  protected readonly category = signal('');
  protected readonly selectedEquipment = signal<Pick<Equipment, 'id' | 'name'> | null>(null);
  protected readonly availability = signal<'unknown' | 'loading' | 'ready' | 'failed'>('unknown');
  private readonly availableIds = signal<Set<number>>(new Set());
  private readonly retryAvailability = new Subject<void>();
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
  protected readonly equipmentMatcher: ErrorStateMatcher = {
    isErrorState: (_control, parent) => Boolean(
      this.form.controls.equipment_id.invalid &&
      (this.form.controls.equipment_id.touched || parent?.submitted),
    ),
  };

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.conflict.set(null);
      this.saveFailed.set(false);
    });
    const periods = this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.period()),
      distinctUntilChanged((a, b) => a?.start === b?.start && a?.end === b?.end),
    );
    merge(periods, this.retryAvailability.pipe(map(() => this.period())))
      .pipe(
        switchMap((period) => {
          this.availableIds.set(new Set());
          if (!period) {
            this.availability.set('unknown');
            return of(null);
          }
          this.availability.set('loading');
          return this.api.availableEquipment(period.start, period.end).pipe(
            map((equipment) => ({ equipment })),
            catchError(() => of({ equipment: null })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (!result) return;
        if (result.equipment === null) {
          this.availability.set('failed');
          return;
        }
        this.availableIds.set(new Set(result.equipment.map((item) => item.id)));
        this.availability.set('ready');
      });
    this.load();
  }

  private period(): { start: string; end: string } | null {
    const { start_date: start, end_date: end } = this.form.getRawValue();
    if (this.form.controls.start_date.invalid || this.form.controls.end_date.invalid ||
      this.form.hasError('dateOrder') || this.form.hasError('outsideBounds')) return null;
    return { start, end };
  }

  protected retryEquipmentAvailability(): void {
    this.retryAvailability.next();
  }

  protected equipmentStatus(item: Equipment): 'available' | 'reserved' | 'in_service' | 'defective' | 'retired' | null {
    if (item.status === 'in_service' || item.status === 'defective' || item.status === 'retired') {
      return item.status;
    }
    if (this.availability() !== 'ready') return null;
    return this.availableIds().has(item.id) ? 'available' : 'reserved';
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
    if (this.saving() || item.status === 'retired') return;
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

  protected submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const { site_id, equipment_id, start_date, end_date, note } = this.form.getRawValue();
    if (this.form.invalid || site_id === null || equipment_id === null) return;
    const request: ReservationCreate = {
      site_id, equipment_id, start_date, end_date, note: note || null,
    };
    this.conflict.set(null);
    this.saveFailed.set(false);
    this.saving.set(true);
    this.pickerOpen.set(false);
    this.form.disable({ emitEvent: false });
    this.api.create(request).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.form.enable({ emitEvent: false });
        if (this.requestedSite && !this.invalidSiteLink()) {
          this.form.controls.site_id.disable({ emitEvent: false });
        }
        this.saving.set(false);
      }),
    ).subscribe({
      next: () => {
        this.notifications.success('Request sent');
        void this.router.navigate(['/reservations']);
      },
      error: (error: unknown) => {
        const conflict = asConflict<ReservationConflictBody>(error);
        if (conflict) this.conflict.set(conflict);
        else this.saveFailed.set(true);
      },
    });
  }

  protected chooseAlternative(alternative: AlternativeEquipment): void {
    if (this.saving()) return;
    this.form.controls.equipment_id.setValue(alternative.id);
    this.selectedEquipment.set(alternative);
    this.submit();
  }
}
