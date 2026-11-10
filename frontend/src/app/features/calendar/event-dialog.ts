import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Status, StatusBadge } from '../../shared/status-badge/status-badge';
import { CalendarEvent } from './calendar.models';

@Component({
  selector: 'app-calendar-event-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, StatusBadge],
  template: `
    <h2 mat-dialog-title>
      {{ event.type === 'reservation' ? 'Reservation' : 'Maintenance' }} #{{ event.id }}
    </h2>
    <mat-dialog-content>
      <h3>{{ event.equipment.name }}</h3>
      <app-status-badge [status]="status" />
      <dl>
        <dt>Equipment type</dt>
        <dd>{{ event.equipment.type }}</dd>
        <dt>Site</dt>
        <dd>{{ event.site?.name ?? 'Equipment maintenance (no site)' }}</dd>
        <dt>Starts</dt>
        <dd>{{ event.start | date: 'dd MMM yyyy' }}</dd>
        <dt>Ends</dt>
        <dd>{{ event.end ? (event.end | date: 'dd MMM yyyy') : 'Ongoing — no end date' }}</dd>
      </dl>
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button mat-dialog-close>Close</button></mat-dialog-actions
    >
  `,
  styles: `
    dt {
      color: var(--color-text-muted);
      margin-top: var(--space-3);
    }
    dd {
      margin: 0;
    }
  `,
})
export class CalendarEventDialog {
  protected readonly event = inject<CalendarEvent>(MAT_DIALOG_DATA);
  protected readonly status = this.event.status as Status;
}
