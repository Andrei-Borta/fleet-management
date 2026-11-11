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

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown.escape)': 'closeNav(true)' },
})
export class App {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  protected readonly roleService = inject(RoleService);
  protected readonly theme = inject(ThemeService);
  protected readonly roles = ROLES;
  protected readonly navOpen = signal(false);

  private readonly sidenav = viewChild.required<ElementRef<HTMLElement>>('sidenav');
  private readonly menuButton = viewChild.required('menuButton', { read: ElementRef });

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
