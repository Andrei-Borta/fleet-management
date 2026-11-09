import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  /** Label of the confirm button. Use a verb, e.g. "Delete". Default: "Confirm". */
  confirmLabel?: string;
  /** Label of the cancel button. Default: "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red). Use it for deletes and other irreversible actions. */
  destructive?: boolean;
}

/**
 * Confirmation dialog (docs/STYLE_GUIDE.md §6). Open it through `ConfirmService.confirm()`,
 * not directly. The cancel button gets the initial focus, so Enter never confirms by accident.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title data-testid="confirm-title">{{ data.title }}</h2>
    <mat-dialog-content>
      <p data-testid="confirm-message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" data-testid="confirm-cancel">
        {{ data.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        mat-flat-button
        [class.danger]="data.destructive"
        [mat-dialog-close]="true"
        data-testid="confirm-accept"
      >
        {{ data.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    p {
      margin: 0;
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
