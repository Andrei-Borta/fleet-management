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
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROLES, RoleService } from './core/role.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown.escape)': 'closeNav(true)' },
})
export class App {
  private readonly injector = inject(Injector);
  protected readonly roleService = inject(RoleService);
  protected readonly theme = inject(ThemeService);
  protected readonly roles = ROLES;
  protected readonly navOpen = signal(false);
  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/equipment', label: 'Equipment', icon: 'construction' },
    { path: '/sites', label: 'Sites', icon: 'location_city' },
    { path: '/reservations', label: 'Reservations', icon: 'event_available' },
    { path: '/calendar', label: 'Calendar', icon: 'calendar_month' },
    { path: '/maintenance', label: 'Maintenance', icon: 'build' },
    { path: '/operations', label: 'Operations', icon: 'fact_check' },
  ];

  private readonly sidenav = viewChild.required<ElementRef<HTMLElement>>('sidenav');
  private readonly menuButton = viewChild.required('menuButton', { read: ElementRef });

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
