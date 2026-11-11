import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { finalize } from 'rxjs';

import { API_URL } from '../core/api';
import { asConflict } from '../core/api-error';
import { NotificationService } from '../core/notification.service';
import { ConfirmService } from '../shared/confirm-dialog/confirm.service';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

/** Endpoint that doesn't exist on the backend. Playwright mocks it to simulate responses. */
export const UI_KIT_PROBE_URL = `${API_URL}/dev/ui-kit-probe`;

/**
 * Dev-only page (registered only in dev builds, not in the nav) that shows the shared UI
 * building blocks and gives the Playwright specs something to drive. Open it at /dev/ui-kit.
 * Also a working example of the loading/error pattern from core/README.md.
 */
@Component({
  selector: 'app-ui-kit-page',
  imports: [PageHeader, MatButtonModule, MatProgressBarModule, StatusBadge],
  template: `
    <app-page-header title="UI kit" subtitle="Shared building blocks (dev only)" />

    <section class="card">
      <h2>Maintenance statuses</h2>
      <div class="actions">
        <app-status-badge status="planned" />
        <app-status-badge status="in_progress" />
        <app-status-badge status="done" />
      </div>
    </section>
    <section class="card">
      <h2>Notifications</h2>
      <div class="actions">
        <button mat-stroked-button data-testid="notify-success" (click)="showSuccess()">
          Show success
        </button>
        <button mat-stroked-button data-testid="notify-error" (click)="showError()">
          Show error
        </button>
      </div>
    </section>

    <section class="card">
      <h2>Confirm dialog</h2>
      <div class="actions">
        <button mat-flat-button class="danger" data-testid="delete-sample" (click)="deleteSample()">
          Delete sample
        </button>
      </div>
      @if (confirmResult(); as result) {
        <p class="text-muted" data-testid="confirm-result">{{ result }}</p>
      }
    </section>

    <section class="card">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" data-testid="probe-loading" />
      }
      <h2>API request</h2>
      <div class="actions">
        <button mat-stroked-button data-testid="probe-request" (click)="sendRequest()">
          Send test request
        </button>
      </div>
      @if (requestResult(); as result) {
        <p class="text-muted" data-testid="probe-result">{{ result }}</p>
      }
    </section>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    p {
      margin: var(--space-4) 0 0;
    }
    mat-progress-bar {
      margin: calc(-1 * var(--space-5)) calc(-1 * var(--space-5)) var(--space-4);
      width: auto;
    }
  `,
})
export class UiKitPage {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly confirmResult = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly requestResult = signal<string | null>(null);

  protected showSuccess(): void {
    this.notifications.success('Sample saved');
  }

  protected showError(): void {
    this.notifications.error('Sample could not be saved');
  }

  protected deleteSample(): void {
    this.confirmService
      .confirm({
        title: 'Delete sample?',
        message: 'This removes the sample. It cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      .subscribe((confirmed) => this.confirmResult.set(confirmed ? 'Confirmed' : 'Cancelled'));
  }

  protected sendRequest(): void {
    this.loading.set(true);
    this.requestResult.set(null);
    this.http
      .get<unknown>(UI_KIT_PROBE_URL)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.requestResult.set('Request succeeded'),
        error: (error: unknown) => {
          const conflict = asConflict(error);
          this.requestResult.set(
            conflict
              ? `Conflict handled by the page: ${conflict.detail} (${conflict.alternatives?.length ?? 0} alternatives)`
              : 'Request failed',
          );
        },
      });
  }
}
