import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

/** Dev-only pages. Not registered in production builds. */
const devRoutes: Routes = [
  {
    path: 'dev/ui-kit',
    title: 'UI kit',
    loadComponent: () => import('./dev/ui-kit.page').then((m) => m.UiKitPage),
  },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard/costs',
    title: 'Site costs',
    loadComponent: () => import('./features/dashboard/costs.page').then((m) => m.CostsPage),
  },
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
    path: 'equipment/new',
    title: 'Add equipment',
    loadComponent: () =>
      import('./features/equipment/equipment-form.page').then((m) => m.EquipmentFormPage),
  },
  {
    path: 'equipment/:id/edit',
    title: 'Edit equipment',
    loadComponent: () =>
      import('./features/equipment/equipment-form.page').then((m) => m.EquipmentFormPage),
  },
  {
    path: 'equipment/:id',
    title: 'Equipment details',
    loadComponent: () =>
      import('./features/equipment/equipment-detail.page').then((m) => m.EquipmentDetailPage),
  },
  {
    path: 'sites',
    title: 'Sites',
    loadComponent: () => import('./features/sites/sites.page').then((m) => m.SitesPage),
  },
  {
    path: 'reservations/new',
    title: 'New reservation',
    loadComponent: () =>
      import('./features/reservations/reservation-form.page').then((m) => m.ReservationFormPage),
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
    path: 'maintenance/report',
    title: 'Report defect',
    loadComponent: () =>
      import('./features/maintenance/defect-report.page').then((m) => m.DefectReportPage),
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
  ...(isDevMode() ? devRoutes : []),
  {
    path: 'sites/new',
    title: 'Add site',
    loadComponent: () => import('./features/sites/site-form.page').then((m) => m.SiteFormPage),
  },
  {
    path: 'sites/:id/edit',
    title: 'Edit site',
    loadComponent: () => import('./features/sites/site-form.page').then((m) => m.SiteFormPage),
  },
  {
    path: 'sites/:id',
    title: 'Site details',
    loadComponent: () => import('./features/sites/site-detail.page').then((m) => m.SiteDetailPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
