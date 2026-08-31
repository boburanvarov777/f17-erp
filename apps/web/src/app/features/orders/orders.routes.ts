import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth.guard';

export const ORDERS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permissions: ['orders.read'] },
    loadComponent: () => import('./pages/orders-list/orders-list.component').then((m) => m.OrdersListComponent),
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permissions: ['orders.read'] },
    loadComponent: () => import('./pages/order-detail/order-detail.component').then((m) => m.OrderDetailComponent),
  },
];
