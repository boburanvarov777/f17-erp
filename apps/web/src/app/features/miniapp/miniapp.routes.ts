import { Routes } from '@angular/router';

export const MINIAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./miniapp-shell.component').then((m) => m.MiniAppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', loadComponent: () => import('./ma-home.component').then((m) => m.MaHomeComponent) },
      { path: 'manage', loadComponent: () => import('./ma-manage.component').then((m) => m.MaManageComponent) },
      { path: 'menu', loadComponent: () => import('./ma-menu.component').then((m) => m.MaMenuComponent) },
      { path: 'report', loadComponent: () => import('./ma-report.component').then((m) => m.MaReportComponent) },
      { path: 'tasks', loadComponent: () => import('./ma-tasks.component').then((m) => m.MaTasksComponent) },
      { path: 'profile', loadComponent: () => import('./ma-profile.component').then((m) => m.MaProfileComponent) },
      { path: 'dashboard', loadComponent: () => import('../dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'orders', loadComponent: () => import('../orders/orders-list.component').then((m) => m.OrdersListComponent) },
      { path: 'orders/:id', loadComponent: () => import('../orders/order-detail.component').then((m) => m.OrderDetailComponent) },
      { path: 'schedule', loadComponent: () => import('../schedule/schedule.component').then((m) => m.ScheduleComponent) },
      { path: 'models', loadComponent: () => import('../models/models-list.component').then((m) => m.ModelsListComponent) },
      { path: 'models/:id', loadComponent: () => import('../models/model-detail.component').then((m) => m.ModelDetailComponent) },
      { path: 'warehouse', loadComponent: () => import('../warehouse/warehouse.component').then((m) => m.WarehouseComponent) },
      { path: 'production/:stage', loadComponent: () => import('../production/production.component').then((m) => m.ProductionComponent) },
      { path: 'my-tasks', loadComponent: () => import('../tasks/my-tasks.component').then((m) => m.MyTasksComponent) },
      { path: 'monitoring', loadComponent: () => import('../tasks/monitoring.component').then((m) => m.MonitoringComponent) },
      { path: 'reports', loadComponent: () => import('../reports/reports.component').then((m) => m.ReportsComponent) },
      { path: 'users', loadComponent: () => import('../users/users.component').then((m) => m.UsersComponent) },
      { path: 'roles', loadComponent: () => import('../users/roles.component').then((m) => m.RolesComponent) },
      { path: 'departments', loadComponent: () => import('../users/departments.component').then((m) => m.DepartmentsComponent) },
      { path: 'audit', loadComponent: () => import('../audit/audit.component').then((m) => m.AuditComponent) },
    ],
  },
];
