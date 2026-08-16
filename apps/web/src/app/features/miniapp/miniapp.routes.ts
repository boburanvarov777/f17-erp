import { Routes } from '@angular/router';

export const MINIAPP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./miniapp-shell.component').then((m) => m.MiniAppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', loadComponent: () => import('./ma-home.component').then((m) => m.MaHomeComponent) },
      { path: 'report', loadComponent: () => import('./ma-report.component').then((m) => m.MaReportComponent) },
      { path: 'tasks', loadComponent: () => import('./ma-tasks.component').then((m) => m.MaTasksComponent) },
      { path: 'profile', loadComponent: () => import('./ma-profile.component').then((m) => m.MaProfileComponent) },
    ],
  },
];
