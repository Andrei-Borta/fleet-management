import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { finalize, forkJoin } from 'rxjs';

import { NotificationService } from '../../core/notification.service';
import { Equipment } from '../equipment/equipment.models';
import { EquipmentService } from '../equipment/equipment.service';
import { Site } from '../sites/sites.models';
import { SitesService } from '../sites/sites.service';
import { OperationsService } from './operations.service';
import { UsageCreate, UsageRead } from './operations.models';

interface UsageGroup {
  equipment_id: number;
  site_id: number;
  total_hours: number;
  total_fuel_liters: number;
  entries: number;
}

@Component({
  selector: 'app-usage-log',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
  ],
  templateUrl: './usage-log.html',
  styleUrl: './usage-log.scss',
})
/** Daily hours and fuel per machine and site, with totals and history. */
export class UsageLog {
  private readonly api = inject(OperationsService);
  private readonly equipmentApi = inject(EquipmentService);
  private readonly sitesApi = inject(SitesService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly sites = signal<Site[]>([]);
  protected readonly items = signal<UsageRead[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly selectedEquipment = signal<number | null>(null);
  protected readonly selectedSite = signal<number | null>(null);
  protected readonly totalsPage = signal(0);
  protected readonly totalsPageSize = signal(20);
  protected readonly historyPage = signal(0);
  protected readonly historyPageSize = signal(20);
  protected readonly historyColumns = ['equipment', 'site', 'date', 'hours', 'fuel'];
  protected readonly totalsColumns = ['equipment', 'site', 'entries', 'hours', 'fuel'];
  protected readonly form = this.fb.group({
    equipment_id: this.fb.control<number | null>(null, Validators.required),
    site_id: this.fb.control<number | null>(null, Validators.required),
    date: this.fb.nonNullable.control(today(), [
      Validators.required,
      Validators.pattern(/^\d{4}-\d{2}-\d{2}$/),
    ]),
    hours: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(24),
      Validators.pattern(/^\d{1,8}(\.\d{1,2})?$/),
    ]),
    fuel_liters: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.pattern(/^\d{1,8}(\.\d{1,2})?$/),
    ]),
  });

  protected readonly filteredItems = computed(() =>
    this.items().filter(
      (item) =>
        (this.selectedEquipment() === null || item.equipment_id === this.selectedEquipment()) &&
        (this.selectedSite() === null || item.site_id === this.selectedSite()),
    ),
  );
  protected readonly totals = computed(() => {
    const groups = new Map<string, UsageGroup>();
    for (const item of this.filteredItems()) {
      const key = `${item.equipment_id}:${item.site_id}`;
      const group = groups.get(key) ?? {
        equipment_id: item.equipment_id,
        site_id: item.site_id,
        total_hours: 0,
        total_fuel_liters: 0,
        entries: 0,
      };
      group.total_hours += item.hours;
      group.total_fuel_liters += item.fuel_liters;
      group.entries += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) =>
      this.equipmentName(a.equipment_id).localeCompare(this.equipmentName(b.equipment_id)) ||
      this.siteName(a.site_id).localeCompare(this.siteName(b.site_id)),
    );
  });
  protected readonly visibleTotals = computed(() =>
    this.totals().slice(
      this.totalsPage() * this.totalsPageSize(),
      (this.totalsPage() + 1) * this.totalsPageSize(),
    ),
  );
  protected readonly visibleItems = computed(() =>
    this.filteredItems().slice(
      this.historyPage() * this.historyPageSize(),
      (this.historyPage() + 1) * this.historyPageSize(),
    ),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({
      equipment: this.equipmentApi.list(),
      sites: this.sitesApi.list(),
      usage: this.api.listUsage(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ equipment, sites, usage }) => {
          this.equipment.set(equipment);
          this.sites.set(sites);
          this.items.set(usage.items);
        },
        error: () => this.failed.set(true),
      });
  }

  protected equipmentName(id: number): string {
    return this.equipment().find((item) => item.id === id)?.name ?? `Equipment #${id}`;
  }

  protected siteName(id: number): string {
    return this.sites().find((item) => item.id === id)?.name ?? `Site #${id}`;
  }

  protected filterEquipment(id: number | null): void {
    this.selectedEquipment.set(id);
    this.totalsPage.set(0);
    this.historyPage.set(0);
  }

  protected filterSite(id: number | null): void {
    this.selectedSite.set(id);
    this.totalsPage.set(0);
    this.historyPage.set(0);
  }

  protected submit(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const { equipment_id, site_id, date, hours, fuel_liters } = this.form.getRawValue();
    if (
      this.form.invalid ||
      equipment_id === null ||
      site_id === null ||
      hours === null ||
      fuel_liters === null
    )
      return;

    const payload: UsageCreate = { equipment_id, site_id, date, hours, fuel_liters };
    this.saving.set(true);
    this.api
      .logUsage(payload)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notifications.success('Usage logged');
          this.form.patchValue({ date: today(), hours: null, fuel_liters: null });
          this.form.markAsPristine();
          this.form.markAsUntouched();
          this.load();
        },
        // The error interceptor reports the failure; the form keeps the values for a retry.
        error: () => undefined,
      });
  }
}

function today(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
