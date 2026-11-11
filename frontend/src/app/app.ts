import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROLES, Role, RoleService } from './core/role.service';
import { ThemeService } from './core/theme.service';
import { NotificationsFeedService } from './features/notifications/notifications.service';

@Component({
  selector: 'app-root',
  imports: [DatePipe, RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown.escape)': 'handleEscape()',
    '(document:click)': 'closeNotificationsOutside($event)',
  },
})
export class App {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  protected readonly roleService = inject(RoleService);
  protected readonly theme = inject(ThemeService);
  protected readonly notificationFeed = inject(NotificationsFeedService);
  protected readonly roles = ROLES;
  protected readonly navOpen = signal(false);
  protected readonly notificationOpen = signal(false);

  private readonly sidenav = viewChild.required<ElementRef<HTMLElement>>('sidenav');
  private readonly menuButton = viewChild.required('menuButton', { read: ElementRef });
  private readonly notificationMenu = viewChild<ElementRef<HTMLElement>>('notificationMenu');

  /**
   * Switches the demo role. Leaves the current page when the new role doesn't see it,
   * or when the user is still on the previous role's landing page.
   */
  protected switchRole(role: Role): void {
    const previousHome = this.roleService.homeOf(this.roleService.role());
    this.roleService.role.set(role);
    const url = this.router.url.split(/[?#]/)[0];
    if (url === previousHome || !this.roleService.canVisit(url)) {
      void this.router.navigateByUrl(this.roleService.home());
    }
  }

  protected toggleNotifications(): void {
    this.notificationOpen.update((open) => !open);
  }

  protected openNotification(id: number): void {
    this.notificationFeed.markRead(id);
    this.notificationOpen.set(false);
  }

  protected closeNotifications(): void {
    this.notificationOpen.set(false);
  }

  /** Clicking anywhere outside the bell and its panel closes the panel. */
  protected closeNotificationsOutside(event: MouseEvent): void {
    const menu = this.notificationMenu()?.nativeElement;
    if (this.notificationOpen() && menu && !menu.contains(event.target as Node)) {
      this.closeNotifications();
    }
  }
  protected handleEscape(): void {
    this.closeNav(true);
    this.closeNotifications();
  }

  protected toggleNav(): void {
    if (this.navOpen()) {
      this.closeNav(true);
    } else {
      this.openNav();
    }
  }

  /** Mobile only: slides the nav in and moves focus to its first link. */
  protected openNav(): void {
    this.navOpen.set(true);
    afterNextRender(() => this.sidenav().nativeElement.querySelector('a')?.focus(), {
      injector: this.injector,
    });
  }

  /** Closes the mobile nav. `restoreFocus` returns focus to the menu button (Esc, backdrop). */
  protected closeNav(restoreFocus = false): void {
    if (!this.navOpen()) {
      return;
    }
    this.navOpen.set(false);
    if (restoreFocus) {
      (this.menuButton().nativeElement as HTMLElement).focus();
    }
  }
}
