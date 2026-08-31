import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth.guard';

export const MODELS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permissions: ['models.read'] },
    loadComponent: () => import('./pages/models-list/models-list.component').then((m) => m.ModelsListComponent),
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permissions: ['models.read'] },
    loadComponent: () => import('./pages/model-detail/model-detail.component').then((m) => m.ModelDetailComponent),
  },
];
