import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, finalize, merge, switchMap, tap, timer } from 'rxjs';

import { API_URL } from '../../core/api';
import { SKIP_ERROR_NOTIFICATION } from '../../core/error.interceptor';
import { RoleService } from '../../core/role.service';
import { Notification, ReadAllResult } from './notifications.models';

const POLL_INTERVAL_MS = 30_000;
const URL = `${API_URL}/notifications`;
/** The bell reports its own errors in the panel, so the interceptor's snackbar is skipped. */
const QUIET = { context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true) };

/** The current role's notification feed, refreshed on role change and every 30 seconds. */
@Injectable({ providedIn: 'root' })
export class NotificationsFeedService {
  private readonly http = inject(HttpClient);
  private readonly roleService = inject(RoleService);
  private readonly refreshRequests = new Subject<void>();

  readonly items = signal<Notification[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly unreadCount = computed(() => this.items().filter((item) => !item.read_at).length);

  constructor() {
    effect((onCleanup) => {
      // The role is sent as X-Role, so a new role means a new feed.
      this.roleService.role();
      this.items.set([]);
      this.loading.set(true);
      this.failed.set(false);
      const subscription = merge(timer(0, POLL_INTERVAL_MS), this.refreshRequests)
        .pipe(
          switchMap(() => {
            this.loading.set(true);
            return this.http.get<Notification[]>(URL, QUIET).pipe(
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

  /** Marks one notification read straight away and undoes it if the request fails. */
  markRead(id: number): void {
    const notification = this.items().find((item) => item.id === id);
    if (!notification || notification.read_at) return;
    this.setReadAt([id], new Date().toISOString());
    this.http
      .post<Notification>(`${URL}/${id}/read`, null, QUIET)
      .pipe(
        tap((saved) => this.setReadAt([id], saved.read_at)),
        catchError(() => {
          this.setReadAt([id], null);
          this.failed.set(true);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** Marks the whole feed read straight away and undoes it if the request fails. */
  markAllRead(): void {
    const unread = this.items()
      .filter((item) => !item.read_at)
      .map((item) => item.id);
    if (unread.length === 0) return;
    this.setReadAt(unread, new Date().toISOString());
    this.http
      .post<ReadAllResult>(`${URL}/read-all`, null, QUIET)
      .pipe(
        catchError(() => {
          this.setReadAt(unread, null);
          this.failed.set(true);
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private setReadAt(ids: number[], readAt: string | null): void {
    this.items.update((items) =>
      items.map((item) => (ids.includes(item.id) ? { ...item, read_at: readAt } : item)),
    );
  }
}
