import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, finalize, merge, switchMap, tap, timer } from 'rxjs';

import { API_URL } from '../../core/api';
import { SKIP_ERROR_NOTIFICATION } from '../../core/error.interceptor';
import { RoleService } from '../../core/role.service';
import { FleetNotification } from './notifications.models';

const POLL_INTERVAL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class NotificationsFeedService {
  private readonly http = inject(HttpClient);
  private readonly roleService = inject(RoleService);
  private readonly refreshRequests = new Subject<void>();

  readonly items = signal<FleetNotification[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly unreadCount = computed(() => this.items().filter((item) => !item.is_read).length);

  constructor() {
    effect((onCleanup) => {
      this.roleService.role();
      this.items.set([]);
      this.loading.set(true);
      this.failed.set(false);

      const subscription = merge(timer(0, POLL_INTERVAL_MS), this.refreshRequests)
        .pipe(
          switchMap(() => {
            this.loading.set(true);
            return this.http
              .get<FleetNotification[]>(`${API_URL}/notifications`, {
                context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true),
              })
              .pipe(
                tap((items) => {
                  this.items.set(items);
                  this.failed.set(false);
                }),
                catchError(() => {
                  this.failed.set(true);
                  return EMPTY;
                }),
                finalize(() => this.loading.set(false)),
              );
          }),
        )
        .subscribe();

      onCleanup(() => subscription.unsubscribe());
    });
  }

  refresh(): void {
    this.refreshRequests.next();
  }

  markRead(id: number): void {
    const notification = this.items().find((item) => item.id === id);
    if (!notification || notification.is_read) return;

    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );

    this.http
      .post<void>(`${API_URL}/notifications/${id}/read`, null, {
        context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true),
      })
      .pipe(
        catchError(() => {
          this.items.update((items) =>
            items.map((item) => (item.id === id ? { ...item, is_read: false } : item)),
          );
          this.failed.set(true);
          return EMPTY;
        }),
      )
      .subscribe();
  }
}