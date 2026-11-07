import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'equipment',
    title: 'Equipment',
    loadComponent: () => import('./features/equipment/equipment.page').then((m) => m.EquipmentPage),
  },
  {
    path: 'sites',
    title: 'Sites',
    loadComponent: () => import('./features/sites/sites.page').then((m) => m.SitesPage),
  },
  {
    path: 'reservations',
    title: 'Reservations',
    loadComponent: () =>
      import('./features/reservations/reservations.page').then((m) => m.ReservationsPage),
  },
  {
    path: 'calendar',
    title: 'Calendar',
    loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
  },
  {
    path: 'maintenance',
    title: 'Maintenance',
    loadComponent: () =>
      import('./features/maintenance/maintenance.page').then((m) => m.MaintenancePage),
  },
  {
    path: 'operations',
    title: 'Operations',
    loadComponent: () =>
      import('./features/operations/operations.page').then((m) => m.OperationsPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
