import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import type { AuthResponse, CurrentUser } from '../models';
import { isSuperProAdmin } from '../utils/role.util';
import { ApiService } from './api.service';

const ACCESS = 'f17_access';
const REFRESH = 'f17_refresh';
const USER = 'f17_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly user = signal<CurrentUser | null>(readUser());
  readonly isAuthenticated = computed(() => !!this.user() && !!this.accessToken);
  readonly permissions = computed(() => this.user()?.permissions ?? []);
  readonly isSuperAdmin = computed(() => this.permissions().includes('*'));
  readonly isSuperProAdmin = computed(() => isSuperProAdmin(this.user()));

  get accessToken(): string | null { return localStorage.getItem(ACCESS); }
  get refreshToken(): string | null { return localStorage.getItem(REFRESH); }

  /** Backend re-checks every permission; this only shapes the UI. */
  /** View-only session (bot "Admin" account): every action button is hidden. */
  readonly readOnly = computed(() => this.user()?.role?.code === 'BOT_ADMIN');

  can(...perms: string[]): boolean {
    if (this.readOnly() && !perms.some((p) => p.endsWith('.read'))) return false;
    const mine = this.permissions();
    if (mine.includes('*')) return true;
    return perms.some((p) => mine.includes(p));
  }

  login(login: string, password: string, departmentCode?: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/login', { login, password, departmentCode }).pipe(
      tap((res) => this.store(res)),
    );
  }

  refresh(): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/refresh', { refreshToken: this.refreshToken }).pipe(
      tap((res) => this.store(res)),
    );
  }

  me(): Observable<CurrentUser> {
    return this.api.get<CurrentUser>('/auth/me').pipe(
      tap((u) => {
        this.user.set(u);
        localStorage.setItem(USER, JSON.stringify(u));
      }),
    );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.api.post('/auth/change-password', { currentPassword, newPassword });
  }

  store(res: AuthResponse): void {
    localStorage.setItem(ACCESS, res.accessToken);
    localStorage.setItem(REFRESH, res.refreshToken);
    localStorage.setItem(USER, JSON.stringify(res.user));
    this.user.set(res.user);
  }

  logout(navigate = true): void {
    const rt = this.refreshToken;
    if (rt) this.api.post('/auth/logout', { refreshToken: rt }).subscribe({ error: () => void 0 });
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(USER);
    this.user.set(null);
    if (navigate) {
      // Inside the Telegram Mini App stay there — its shell shows its own login form.
      // Inside Telegram (also the admin views opened from the bot) → back to the bot login.
      const w = typeof window !== 'undefined' ? (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp : undefined;
      const inMiniApp = typeof location !== 'undefined' && (location.pathname.startsWith('/miniapp') || !!w?.initData);
      void this.router.navigate([inMiniApp ? '/miniapp' : '/login']);
    }
  }
}

function readUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(USER);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}
