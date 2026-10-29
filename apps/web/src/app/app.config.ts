import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { langInterceptor } from './core/interceptors/lang.interceptor';
import { startTooltipSync } from './core/utils/tooltip-sync';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { firstValueFrom } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => startTooltipSync()),
    // Refresh the cached user on load so role/permission changes made in Rollar
    // (e.g. delete buttons) show up without logging out. Never blocks startup.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      if (!auth.accessToken) return;
      return firstValueFrom(auth.me()).then(() => undefined, () => undefined);
    }),
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([langInterceptor, authInterceptor, errorInterceptor])),
  ],
};
