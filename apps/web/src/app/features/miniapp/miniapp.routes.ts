import { Routes } from '@angular/router';

export const MINIAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./miniapp-shell.component').then((m) => m.MiniAppShellComponent),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./ma-redirect.component').then((m) => m.MaRedirectComponent) },
      { path: 'warehouse', loadComponent: () => import('./ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'warehouse/history', loadComponent: () => import('./ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'warehouse/alerts', loadComponent: () => import('./ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'home', loadComponent: () => import('./ma-home.component').then((m) => m.MaHomeComponent) },
      { path: 'home/:period', loadComponent: () => import('./ma-plan-detail.component').then((m) => m.MaPlanDetailComponent) },
      { path: 'manage', loadComponent: () => import('./ma-manage.component').then((m) => m.MaManageComponent) },
      { path: 'report', loadComponent: () => import('./ma-report.component').then((m) => m.MaReportComponent) },
      { path: 'analytics', loadComponent: () => import('./ma-analytics.component').then((m) => m.MaAnalyticsComponent) },
      { path: 'tasks', loadComponent: () => import('./ma-tasks.component').then((m) => m.MaTasksComponent) },
      { path: 'profile', loadComponent: () => import('./ma-profile.component').then((m) => m.MaProfileComponent) },
    ],
  },
];
