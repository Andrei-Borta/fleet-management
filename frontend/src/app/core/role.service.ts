import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/** Demo roles. No authentication in the MVP: the selected role is sent as an X-Role header. */
export type Role = 'site_manager' | 'fleet_manager' | 'mechanic' | 'operator';

export const ROLES: { value: Role; label: string }[] = [
  { value: 'site_manager', label: 'Site manager' },
  { value: 'fleet_manager', label: 'Fleet manager' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'operator', label: 'Operator' },
];

export const ROLE_STORAGE_KEY = 'fleet.role';

/** Actions that only some roles see. The backend does not enforce these in the MVP. */
export type Permission =
  | 'equipment.manage'
  | 'sites.manage'
  | 'reservations.request'
  | 'reservations.decide';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { path: '/equipment', label: 'Equipment', icon: 'construction' },
  { path: '/sites', label: 'Sites', icon: 'location_city' },
  { path: '/reservations', label: 'Reservations', icon: 'event_available' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar_month' },
  { path: '/maintenance', label: 'Maintenance', icon: 'build' },
  { path: '/operations', label: 'Operations', icon: 'fact_check' },
];

interface RoleProfile {
  /** Landing page after choosing the role. Always one of `nav`. */
  home: string;
  /** Top-level pages shown in the side nav, in NAV_ITEMS order. */
  nav: string[];
  permissions: Permission[];
}

const PROFILES: Record<Role, RoleProfile> = {
  fleet_manager: {
    home: '/dashboard',
    nav: NAV_ITEMS.map((item) => item.path),
    permissions: ['equipment.manage', 'sites.manage', 'reservations.request', 'reservations.decide'],
  },
  site_manager: {
    home: '/dashboard',
    nav: ['/dashboard', '/equipment', '/sites', '/reservations', '/calendar'],
    permissions: ['reservations.request'],
  },
  mechanic: {
    home: '/maintenance',
    nav: ['/equipment', '/calendar', '/maintenance'],
    permissions: [],
  },
  operator: {
    home: '/operations',
    nav: ['/equipment', '/reservations', '/calendar', '/maintenance', '/operations'],
    permissions: [],
  },
};

function isRole(value: unknown): value is Role {
  return ROLES.some((r) => r.value === value);
}

/**
 * The selected demo role and what it may see. The choice is saved in localStorage.
 * Templates call `can()` / read `nav()` directly; both track the `role` signal.
 */
@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly document = inject(DOCUMENT);

  readonly role = signal<Role>(this.readStored() ?? 'fleet_manager');
  readonly home = computed(() => PROFILES[this.role()].home);
  readonly nav = computed(() => {
    const allowed = PROFILES[this.role()].nav;
    return NAV_ITEMS.filter((item) => allowed.includes(item.path));
  });

  constructor() {
    effect(() => this.store(this.role()));
  }

  can(permission: Permission): boolean {
    return PROFILES[this.role()].permissions.includes(permission);
  }

  /** Landing page of any role, e.g. to tell whether the user is still on the previous role's home. */
  homeOf(role: Role): string {
    return PROFILES[role].home;
  }

  /** Whether `url` belongs to a section shown in this role's nav (`/sites/3` → `/sites`). */
  canVisit(url: string): boolean {
    const section = '/' + (url.split(/[?#]/)[0].split('/')[1] ?? '');
    return PROFILES[this.role()].nav.includes(section);
  }

  private store(role: Role): void {
    try {
      this.document.defaultView?.localStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      // Storage can be blocked (private mode, disabled site data). The role still applies.
    }
  }

  private readStored(): Role | null {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(ROLE_STORAGE_KEY);
      return isRole(stored) ? stored : null;
    } catch {
      return null;
    }
  }
}
