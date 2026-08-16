import { Routes } from '@angular/router';
import { authGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
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
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'orders',
        canActivate: [permissionGuard],
        data: { permissions: ['orders.read'] },
        loadComponent: () => import('./features/orders/orders-list.component').then((m) => m.OrdersListComponent),
      },
      {
        path: 'orders/:id',
        canActivate: [permissionGuard],
        data: { permissions: ['orders.read'] },
        loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent),
      },
      {
        path: 'schedule',
        canActivate: [permissionGuard],
        data: { permissions: ['schedule.read', 'orders.read'] },
        loadComponent: () => import('./features/schedule/schedule.component').then((m) => m.ScheduleComponent),
      },
      {
        path: 'models',
        canActivate: [permissionGuard],
        data: { permissions: ['models.read'] },
        loadComponent: () => import('./features/models/models-list.component').then((m) => m.ModelsListComponent),
      },
      {
        path: 'models/:id',
        canActivate: [permissionGuard],
        data: { permissions: ['models.read'] },
        loadComponent: () => import('./features/models/model-detail.component').then((m) => m.ModelDetailComponent),
      },
      {
        path: 'warehouse',
        canActivate: [permissionGuard],
        data: { permissions: ['warehouse.read'] },
        loadComponent: () => import('./features/warehouse/warehouse.component').then((m) => m.WarehouseComponent),
      },
      {
        path: 'production/:stage',
        loadComponent: () => import('./features/production/production.component').then((m) => m.ProductionComponent),
      },
      {
        path: 'my-tasks',
        loadComponent: () => import('./features/tasks/my-tasks.component').then((m) => m.MyTasksComponent),
      },
      {
        path: 'monitoring',
        canActivate: [permissionGuard],
        data: { permissions: ['users.read'] },
        loadComponent: () => import('./features/tasks/monitoring.component').then((m) => m.MonitoringComponent),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permissions: ['reports.read'] },
        loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permissions: ['users.read'] },
        loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard],
        data: { permissions: ['roles.read'] },
        loadComponent: () => import('./features/users/roles.component').then((m) => m.RolesComponent),
      },
      {
        path: 'departments',
        canActivate: [permissionGuard],
        data: { permissions: ['departments.read'] },
        loadComponent: () => import('./features/users/departments.component').then((m) => m.DepartmentsComponent),
      },
      {
        path: 'audit',
        canActivate: [permissionGuard],
        data: { permissions: ['audit.read'] },
        loadComponent: () => import('./features/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
