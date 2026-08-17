import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { I18nService } from '../services/i18n.service';

/** Surfaces server-side validation and business-rule errors as toasts. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const i18n = inject(I18nService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const silent = req.headers.has('X-Silent') || req.url.includes('/auth/refresh') || req.url.includes('/auth/login');
      if (!silent && err.status !== 401 && err.status !== 403) {
        const raw = err.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        if (err.status === 0) toast.error(i18n.t('error_network'));
        else if (msg) toast.error(msg);
        else toast.error(i18n.t('error_http', { status: err.status }));
      }
      return throwError(() => err);
    }),
  );
};
