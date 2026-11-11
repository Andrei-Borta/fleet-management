import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { RoleService } from '../../core/role.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { Site } from './sites.models';
import { SitesService } from './sites.service';

@Component({
  selector: 'app-sites-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './sites.page.html',
  styleUrl: './sites.page.scss',
})
export class SitesPage {
  private readonly service = inject(SitesService);
  protected readonly roles = inject(RoleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly paginator = viewChild(MatPaginator);

  protected readonly columns = ['name', 'budget', 'start_date', 'end_date'];
  protected readonly table = new MatTableDataSource<Site>();
  protected readonly items = signal<Site[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      this.table.paginator = this.paginator() ?? null;
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
        next: (sites) => {
          this.items.set(sites);
          this.table.data = sites;
        },
        error: () => this.failed.set(true),
      });
  }
}
