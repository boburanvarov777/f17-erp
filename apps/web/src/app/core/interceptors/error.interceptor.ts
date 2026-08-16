import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/** Surfaces server-side validation and business-rule errors as toasts. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const silent = req.headers.has('X-Silent') || req.url.includes('/auth/refresh');
      if (!silent && err.status !== 401 && err.status !== 403) {
        const raw = err.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        if (err.status === 0) toast.error('Server bilan aloqa yo‘q');
        else if (msg) toast.error(msg);
        else toast.error(`Xatolik ${err.status}`);
      }
      return throwError(() => err);
    }),
  );
};
