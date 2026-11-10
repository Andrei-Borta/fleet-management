import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-pending-requests-widget',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  template: `
    <section class="card" aria-labelledby="pending-heading" [attr.aria-busy]="loading()">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" aria-label="Loading pending requests" />
      }
      <h2 id="pending-heading">Pending requests</h2>
      @if (failed()) {
        <div class="empty-state">
          <p>Pending requests could not be loaded.</p>
          <button mat-stroked-button (click)="load()">Retry</button>
        </div>
      } @else if (!loading() && count() === 0) {
        <div class="empty-state">
          <span class="material-symbols-rounded" aria-hidden="true">event_available</span>
          <p>No pending requests.</p>
        </div>
      } @else if (!loading()) {
        <p><span class="text-display num">{{ count() }}</span>
          {{ count() === 1 ? 'request awaiting approval' : 'requests awaiting approval' }}</p>
      }
      <a mat-stroked-button routerLink="/reservations">View requests</a>
    </section>
  `,
  styles: `
    :host { display: block; margin-top: var(--space-5); }
  `,
})
export class PendingRequestsWidget {
  private readonly api = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly count = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.pendingRequests()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (requests) => this.count.set(requests.length),
        error: () => this.failed.set(true),
      });
  }
}
