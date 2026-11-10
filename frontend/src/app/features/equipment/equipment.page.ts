import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { finalize } from 'rxjs';

import { PageHeader } from '../../shared/page-header/page-header';
import { StatusBadge } from '../../shared/status-badge/status-badge';
import { Equipment, EquipmentStatus } from './equipment.models';
import { EquipmentService } from './equipment.service';

@Component({
  selector: 'app-equipment-page',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    PageHeader,
    StatusBadge,
  ],
  templateUrl: './equipment.page.html',
  styleUrl: './equipment.page.scss',
})
export class EquipmentPage {
  private readonly service = inject(EquipmentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  protected readonly columns = ['name', 'type', 'status', 'engine_hours', 'hourly_cost'];
  protected readonly table = new MatTableDataSource<Equipment>();
  protected readonly items = signal<Equipment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly search = signal('');
  protected readonly type = signal('');
  protected readonly status = signal<EquipmentStatus | ''>('');
  protected readonly types = computed(() =>
    [...new Set(this.items().map((item) => item.type))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly filtered = computed(() => {
    const search = this.search().trim().toLowerCase();
    const type = this.type();
    const status = this.status();
    return this.items().filter(
      (item) =>
        item.name.toLowerCase().includes(search) &&
        (!type || item.type === type) &&
        (!status || item.status === status),
    );
  });

  constructor() {
    effect(() => {
      this.table.sort = this.sort() ?? null;
      this.table.paginator = this.paginator() ?? null;
    });
    effect(() => {
      this.table.data = this.filtered();
      this.table.paginator?.firstPage();
    });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => this.failed.set(true),
      });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.type.set('');
    this.status.set('');
  }
}
