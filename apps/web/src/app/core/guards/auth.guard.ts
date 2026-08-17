import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isSuperProAdmin } from '../role.util';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/** Route-level permission gate. Data: { permissions: ['orders.read'] } */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = (route.data?.['permissions'] as string[]) ?? [];
  if (!required.length || auth.can(...required)) return true;
  return router.createUrlTree(['/dashboard']);
};

/** Audit logs — Super Pro Admin role only (not Super Admin or custom roles). */
export const superProAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (isSuperProAdmin(auth.user())) return true;
  return router.createUrlTree(['/dashboard']);
};
