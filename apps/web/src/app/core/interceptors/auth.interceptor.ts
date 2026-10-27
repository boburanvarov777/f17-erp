import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, ReplaySubject, catchError, switchMap, take, throwError } from 'rxjs';
import { I18nService } from '../services/i18n.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * One shared refresh at a time. Every request that hits a 401 while a refresh is
 * running waits on this subject; it emits the new token, or errors when the refresh
 * failed — so waiting requests never hang forever.
 */
let pending: ReplaySubject<string> | null = null;

function refreshOnce(auth: AuthService): Observable<string> {
  if (!pending) {
    const subject = new ReplaySubject<string>(1);
    pending = subject;
    auth.refresh().subscribe({
      next: (res) => {
        subject.next(res.accessToken);
        subject.complete();
        pending = null;
      },
      error: (e) => {
        subject.error(e);
        pending = null;
      },
    });
  }
  return pending.pipe(take(1));
}

/** Attaches the access token and transparently rotates it on a 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const i18n = inject(I18nService);

  const attach = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  const isAuthCall =
    req.url.includes('/auth/login') || req.url.includes('/auth/refresh') || req.url.includes('/auth/logout');

  const sessionEnded = (err: unknown) => {
    auth.logout();
    return throwError(() => err);
  };

  return next(attach(auth.accessToken)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall) {
        const silent = req.headers.has('X-Silent');
        if (err.status === 403 && !silent) toast.error(err.error?.message || i18n.t('access_denied'));
        return throwError(() => err);
      }

      // 401 with nothing to refresh with → straight to the login page.
      if (!auth.refreshToken) return sessionEnded(err);

      return refreshOnce(auth).pipe(
        // Refresh itself failed → session is over.
        catchError((e) => sessionEnded(e)),
        switchMap((token) =>
          next(attach(token)).pipe(
            catchError((retryErr: HttpErrorResponse) =>
              // Still 401 with a fresh token → user was blocked/archived. Other errors
              // (500, 400…) belong to the request itself and must not log the user out.
              retryErr.status === 401 ? sessionEnded(retryErr) : throwError(() => retryErr),
            ),
          ),
        ),
      );
    }),
  );
};
