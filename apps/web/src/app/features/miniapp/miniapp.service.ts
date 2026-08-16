import { Injectable, inject, signal } from '@angular/core';
import type { AuthResponse, CurrentUser, Department } from '../../core/models';
import { seesFullManage, seesManageTab } from '../../core/role.util';
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

  can(...perms: string[]): boolean {
    const mine = this.user()?.permissions ?? [];
    if (mine.includes('*')) return true;
    return perms.some((p) => mine.includes(p));
  }

  hasStage(): boolean {
    return !!this.user()?.department?.stage;
  }

  seesFullManage(): boolean {
    return seesFullManage(this.user());
  }

  seesManageTab(): boolean {
    return seesManageTab(this.user());
  }

  init(): void {
    const w = tg();
    w?.ready();
    w?.expand();
    if (w?.colorScheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    this.api.get<Department[]>('/departments/public').subscribe({
      next: (d) => this.departments.set(d),
      error: () => void 0,
    });

    const initData = w?.initData?.trim();
    if (initData) {
      this.auth.logout(false);
      this.user.set(null);
      this.state.set('login');
      this.message.set('Bo‘lim, login va parol bilan kiring.');
      return;
    }

    if (this.auth.isAuthenticated()) {
      this.auth.me().subscribe({
        next: (u) => { this.user.set(u); this.state.set('ready'); },
        error: () => this.state.set('login'),
      });
    } else {
      this.state.set('login');
      this.message.set('Telegram tashqarisida ochildi — login va parol bilan kiring.');
    }
  }

  login(login: string, password: string, departmentCode?: string) {
    const initData = tg()?.initData?.trim();
    if (initData) {
      return this.api.post<AuthResponse>('/telegram/mini-app/login', { initData, login, password, departmentCode });
    }
    return this.api.post<AuthResponse>('/auth/login', { login, password, departmentCode });
  }

  apply(res: AuthResponse): void {
    this.auth.store(res);
    this.user.set(res.user);
    this.state.set('ready');
  }
}
