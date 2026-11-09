import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';

import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/**
 * Asks the user to confirm an action. Every destructive action goes through it.
 *
 * ```ts
 * this.confirm
 *   .confirm({ title: 'Delete site?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true })
 *   .pipe(filter(Boolean), switchMap(() => this.sites.delete(id)))
 *   .subscribe(() => this.notifications.success('Site deleted'));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  /** Emits `true` if the user confirmed, `false` if they cancelled or closed the dialog, then completes. */
  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        width: '560px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(map((result) => result === true));
  }
}
