import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/page-header/page-header';
import { Status, StatusBadge } from '../../shared/status-badge/status-badge';
import { Equipment } from '../equipment/equipment.models';
import { Site } from '../sites/sites.models';
import { CalendarEvent } from './calendar.models';
import { CalendarService } from './calendar.service';
import { CalendarEventDialog } from './event-dialog';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addDays(date: Date, count: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + count);
  return copy;
}
@Component({
  selector: 'app-calendar-page',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressBarModule,
    PageHeader,
    StatusBadge,
  ],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPage {
  private readonly api = inject(CalendarService);
  private readonly dialog = inject(MatDialog);
  private readonly refresh = new Subject<void>();
  protected readonly mode = signal<'week' | 'month'>('week');
  protected readonly anchor = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
  );
  protected readonly site = signal<number | null>(null);
  protected readonly type = signal('');
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly equipment = signal<Equipment[]>([]);
  protected readonly sites = signal<Site[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly types = computed(() =>
    [...new Set(this.equipment().map((e) => e.type))].sort(),
  );
  protected readonly start = computed(() => {
    const a = this.anchor();
    const day = new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()));
    return this.mode() === 'month'
      ? new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
      : addDays(day, -((day.getUTCDay() + 6) % 7));
  });
  protected readonly days = computed(() => {
    const start = this.start();
    const count =
      this.mode() === 'week'
        ? 7
        : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => iso(addDays(start, i)));
  });
  protected readonly rows = computed(() =>
    this.equipment().filter(
      (e) =>
        (!this.type() || e.type === this.type()) &&
        (this.site() === null || this.events().some((event) => event.equipment.id === e.id)),
    ),
  );
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly columns = computed(() => ['equipment', ...this.days()]);
  protected readonly visibleRows = computed(() =>
    this.rows().slice(this.pageIndex() * this.pageSize(), (this.pageIndex() + 1) * this.pageSize()),
  );
  protected readonly hasEvents = computed(() =>
    this.events().some((e) => !this.type() || e.equipment.type === this.type()),
  );
  constructor() {
    this.refresh
      .pipe(
        startWith(undefined),
        switchMap(() => {
          this.pageIndex.set(0);
          this.loading.set(true);
          this.failed.set(false);
          return forkJoin({
            events: this.api.events(this.days()[0], this.days().at(-1)!, this.site()),
            equipment: this.api.equipment(),
            sites: this.api.sites(),
          }).pipe(
            map((data) => ({ data, failed: false })),
            catchError(() => of({ data: null, failed: true })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        this.failed.set(result.failed);
        if (result.data) {
          this.events.set(result.data.events);
          this.equipment.set(result.data.equipment);
          this.sites.set(result.data.sites);
        }
      });
  }
  protected load(): void {
    this.refresh.next();
  }
  protected navigate(direction: number): void {
    const a = this.anchor();
    this.anchor.set(
      this.mode() === 'week'
        ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + direction * 7)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1),
    );
    this.load();
  }
  protected today(): void {
    this.anchor.set(new Date());
    this.load();
  }
  protected onDay(id: number, day: string): CalendarEvent[] {
    return this.events().filter(
      (e) => e.equipment.id === id && e.start <= day && (e.end === null || e.end >= day),
    );
  }
  protected status(event: CalendarEvent): Status {
    return event.status as Status;
  }
  protected open(event: CalendarEvent): void {
    this.dialog.open(CalendarEventDialog, {
      data: event,
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }
}
