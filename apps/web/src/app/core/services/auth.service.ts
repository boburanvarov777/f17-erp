import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import type { AuthResponse, CurrentUser } from '../models';
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
  readonly isSuperProAdmin = computed(() => this.permissions().includes('*'));

  get accessToken(): string | null { return localStorage.getItem(ACCESS); }
  get refreshToken(): string | null { return localStorage.getItem(REFRESH); }

  /** Backend re-checks every permission; this only shapes the UI. */
  can(...perms: string[]): boolean {
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
    if (navigate) void this.router.navigate(['/login']);
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
