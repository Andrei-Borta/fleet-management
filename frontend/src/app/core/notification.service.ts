import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** How long a success message stays on screen (docs/STYLE_GUIDE.md §6, Feedback). */
export const SUCCESS_DURATION_MS = 3000;

/**
 * The only way to show feedback messages. Don't use `MatSnackBar` directly.
 *
 * HTTP errors already show an error message through `errorInterceptor`, so call `error()` only for
 * problems that don't come from a failed request.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  /** Short confirmation, e.g. "Equipment saved". Closes after 3 seconds. */
  success(message: string): void {
    this.snackBar.open(message, undefined, {
      duration: SUCCESS_DURATION_MS,
      panelClass: 'snackbar-success',
    });
  }

  /** Error message. Stays until the user dismisses it. */
  error(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      panelClass: 'snackbar-error',
      politeness: 'assertive',
    });
  }
}
