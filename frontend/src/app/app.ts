import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROLES, RoleService } from './core/role.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly roleService = inject(RoleService);
  protected readonly roles = ROLES;
  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/equipment', label: 'Equipment' },
    { path: '/sites', label: 'Sites' },
    { path: '/reservations', label: 'Reservations' },
    { path: '/calendar', label: 'Calendar' },
    { path: '/maintenance', label: 'Maintenance' },
    { path: '/operations', label: 'Operations' },
  ];
}
