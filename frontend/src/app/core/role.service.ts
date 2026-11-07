import { Injectable, signal } from '@angular/core';

/** Demo roles. No authentication in the MVP: the selected role is sent as an X-Role header. */
export type Role = 'site_manager' | 'fleet_manager' | 'mechanic' | 'operator';

export const ROLES: { value: Role; label: string }[] = [
  { value: 'site_manager', label: 'Site manager' },
  { value: 'fleet_manager', label: 'Fleet manager' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'operator', label: 'Operator' },
];

@Injectable({ providedIn: 'root' })
export class RoleService {
  readonly role = signal<Role>('fleet_manager');
}
