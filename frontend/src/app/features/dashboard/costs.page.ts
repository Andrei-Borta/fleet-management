import { MatTooltipModule } from '@angular/material/tooltip';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { finalize } from 'rxjs';
import { PageHeader } from '../../shared/page-header/page-header';
import { SiteCost } from './costs.models';
import { CostsService } from './costs.service';

@Component({
  selector: 'app-costs-page',
  imports: [
    MatTooltipModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressBarModule,
    PageHeader,
  ],
  templateUrl: './costs.page.html',
  styleUrl: './costs.page.scss',
})
export class CostsPage {
  private readonly api = inject(CostsService);
  protected readonly items = signal<SiteCost[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly site = signal<number | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly selected = computed(() =>
    this.items().find((s) => s.site_id === this.selectedId()),
  );
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly filtered = computed(() =>
    this.items().filter((s) => this.site() === null || s.site_id === this.site()),
  );
  protected readonly visible = computed(() =>
    this.filtered().slice(
      this.pageIndex() * this.pageSize(),
      (this.pageIndex() + 1) * this.pageSize(),
    ),
  );
  protected readonly columns = ['site', 'budget', 'spent', 'remaining', 'used', 'actions'];
  private readonly moneyFormat = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  protected money(value: number): string {
    return `${this.moneyFormat.format(value)} RON`;
  }
  constructor() {
    this.load();
  }
  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (report) => {
          this.items.set(report.sites);
          this.pageIndex.set(0);
        },
        error: () => this.failed.set(true),
      });
  }
}
