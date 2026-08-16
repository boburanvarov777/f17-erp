import { Injectable, inject, signal } from '@angular/core';
import type { AuthResponse, CurrentUser, Department } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { tg } from './telegram';

@Injectable({ providedIn: 'root' })
export class MiniAppService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly user = signal<CurrentUser | null>(null);
  readonly state = signal<'loading' | 'ready' | 'login' | 'error'>('loading');
  readonly message = signal('');
  readonly departments = signal<Department[]>([]);

  init(): void {
    const w = tg();
    w?.ready();
    w?.expand();
    if (w?.colorScheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    this.api.get<Department[]>('/departments/public').subscribe({
      next: (d) => this.departments.set(d),
      error: () => void 0,
    });

    const initData = w?.initData;
    if (!initData) {
      // Opened outside Telegram (e.g. a browser tab) — fall back to a normal session.
      if (this.auth.isAuthenticated()) {
        this.auth.me().subscribe({
          next: (u) => { this.user.set(u); this.state.set('ready'); },
          error: () => this.state.set('login'),
        });
      } else {
        this.state.set('login');
        this.message.set('Telegram tashqarisida ochildi — login va parol bilan kiring.');
      }
      return;
    }

    this.api.post<AuthResponse>('/telegram/mini-app/auth', { initData }).subscribe({
      next: (res) => {
        this.auth.store(res);
        this.user.set(res.user);
        this.state.set('ready');
      },
      error: () => {
        this.state.set('login');
        this.message.set('');
      },
    });
  }

  login(login: string, password: string, departmentCode?: string) {
    const initData = tg()?.initData;
    const body = { initData, login, password, departmentCode };
    const path = initData ? '/telegram/mini-app/login' : '/auth/login';
    return this.api.post<AuthResponse>(path, initData ? body : { login, password, departmentCode });
  }

  apply(res: AuthResponse): void {
    this.auth.store(res);
    this.user.set(res.user);
    this.state.set('ready');
  }
}
