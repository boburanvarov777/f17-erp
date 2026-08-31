import { Routes } from '@angular/router';

export const MINIAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/miniapp-shell.component').then((m) => m.MiniAppShellComponent),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/ma-redirect/ma-redirect.component').then((m) => m.MaRedirectComponent) },
      { path: 'warehouse', loadComponent: () => import('./pages/ma-warehouse/ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'warehouse/history', loadComponent: () => import('./pages/ma-warehouse/ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'warehouse/alerts', loadComponent: () => import('./pages/ma-warehouse/ma-warehouse.component').then((m) => m.MaWarehouseComponent) },
      { path: 'home', loadComponent: () => import('./pages/ma-home/ma-home.component').then((m) => m.MaHomeComponent) },
      { path: 'home/:period', loadComponent: () => import('./pages/ma-plan-detail/ma-plan-detail.component').then((m) => m.MaPlanDetailComponent) },
      { path: 'manage', loadComponent: () => import('./pages/ma-manage/ma-manage.component').then((m) => m.MaManageComponent) },
      { path: 'report', loadComponent: () => import('./pages/ma-report/ma-report.component').then((m) => m.MaReportComponent) },
      { path: 'analytics', loadComponent: () => import('./pages/ma-analytics/ma-analytics.component').then((m) => m.MaAnalyticsComponent) },
      { path: 'tasks', loadComponent: () => import('./pages/ma-tasks/ma-tasks.component').then((m) => m.MaTasksComponent) },
      { path: 'profile', loadComponent: () => import('./pages/ma-profile/ma-profile.component').then((m) => m.MaProfileComponent) },
    ],
  },
];
