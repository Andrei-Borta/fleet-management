import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROLES, RoleService } from './core/role.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly roleService = inject(RoleService);
  protected readonly roles = ROLES;
  protected readonly navOpen = signal(false);
  protected readonly dark = signal(false);
  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/equipment', label: 'Equipment', icon: 'construction' },
    { path: '/sites', label: 'Sites', icon: 'location_city' },
    { path: '/reservations', label: 'Reservations', icon: 'event_available' },
    { path: '/calendar', label: 'Calendar', icon: 'calendar_month' },
    { path: '/maintenance', label: 'Maintenance', icon: 'build' },
    { path: '/operations', label: 'Operations', icon: 'fact_check' },
  ];

  protected toggleTheme(): void {
    this.dark.update((d) => !d);
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
  }
}
