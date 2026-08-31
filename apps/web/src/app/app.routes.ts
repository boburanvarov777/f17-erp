import { Routes } from '@angular/router';
import { authGuard, permissionGuard, superProAdminGuard, topAdminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'miniapp',
    loadChildren: () => import('./features/miniapp/miniapp.routes').then((m) => m.MINIAPP_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { permissions: ['dashboard.read'] },
        loadComponent: () => import('./features/dashboard/pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'orders',
        loadChildren: () => import('./features/orders/orders.routes').then((m) => m.ORDERS_ROUTES),
      },
      {
        path: 'schedule',
        canActivate: [permissionGuard],
        data: { permissions: ['schedule.read', 'orders.read'] },
        loadComponent: () => import('./features/schedule/pages/schedule/schedule.component').then((m) => m.ScheduleComponent),
      },
      {
        path: 'models',
        loadChildren: () => import('./features/models/models.routes').then((m) => m.MODELS_ROUTES),
      },
      {
        path: 'warehouse',
        canActivate: [permissionGuard],
        data: { permissions: ['warehouse.read'] },
        loadComponent: () => import('./features/warehouse/pages/warehouse/warehouse.component').then((m) => m.WarehouseComponent),
      },
      {
        path: 'production/:stage',
        loadComponent: () => import('./features/production/pages/production/production.component').then((m) => m.ProductionComponent),
      },
      {
        path: 'monitoring',
        canActivate: [permissionGuard],
        data: { permissions: ['users.read'] },
        loadComponent: () => import('./features/tasks/pages/monitoring/monitoring.component').then((m) => m.MonitoringComponent),
      },
      {
        path: 'analytics',
        canActivate: [permissionGuard],
        data: { permissions: ['reports.read'] },
        loadComponent: () => import('./features/analytics/pages/analytics/analytics.component').then((m) => m.AnalyticsComponent),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permissions: ['reports.read'] },
        loadComponent: () => import('./features/reports/pages/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permissions: ['users.read'] },
        loadComponent: () => import('./features/users/pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'roles',
        canActivate: [superProAdminGuard],
        loadComponent: () => import('./features/users/pages/roles/roles.component').then((m) => m.RolesComponent),
      },
      {
        path: 'departments',
        canActivate: [permissionGuard],
        data: { permissions: ['departments.read'] },
        loadComponent: () => import('./features/users/pages/departments/departments.component').then((m) => m.DepartmentsComponent),
      },
      {
        path: 'audit',
        canActivate: [superProAdminGuard],
        loadComponent: () => import('./features/audit/pages/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'archive',
        canActivate: [topAdminGuard],
        loadComponent: () => import('./features/archive/pages/archive/archive.component').then((m) => m.ArchiveComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/pages/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
