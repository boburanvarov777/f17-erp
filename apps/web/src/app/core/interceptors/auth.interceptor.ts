import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

let refreshing = false;
const refreshed$ = new BehaviorSubject<string | null>(null);

/** Attaches the access token and transparently rotates it on a 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);

  const attach = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

  return next(attach(auth.accessToken)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall || !auth.refreshToken) {
        if (err.status === 403) toast.error(err.error?.message || 'Ruxsat yo‘q');
        return throwError(() => err);
      }

      if (refreshing) {
        return refreshed$.pipe(
          filter((t): t is string => t !== null),
          take(1),
          switchMap((t) => next(attach(t))),
        );
      }

      refreshing = true;
      refreshed$.next(null);

      return auth.refresh().pipe(
        switchMap((res) => {
          refreshing = false;
          refreshed$.next(res.accessToken);
          return next(attach(res.accessToken));
        }),
        catchError((e) => {
          refreshing = false;
          auth.logout();
          return throwError(() => e);
        }),
      );
    }),
  );
};
