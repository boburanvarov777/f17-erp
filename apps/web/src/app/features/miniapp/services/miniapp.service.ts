import { Injectable, effect, inject, signal } from '@angular/core';
import type { AuthResponse, CurrentUser, Department } from '../../../core/models';
import { seesFullManage, seesManageTab, isWarehouseUser } from '../../../core/utils/role.util';
import { ApiService } from '../../../core/services/api.service';
import { I18nService } from '../../../core/services/i18n.service';
import { AuthService } from '../../../core/services/auth.service';
import { tg } from '../utils/telegram';

@Injectable({ providedIn: 'root' })
export class MiniAppService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);

  readonly user = signal<CurrentUser | null>(null);
  readonly state = signal<'loading' | 'ready' | 'login' | 'error'>('loading');
  readonly message = signal('');
  readonly departments = signal<Department[]>([]);
  /** Bumped after production entry — home + report reload. */
  readonly productionTick = signal(0);
  /** Stage picked in the bot by users not tied to one stage (bot admin, managers). */
  readonly chosenStage = signal<string | null>(null);

  /** Production stages this user may work in, in line order. */
  availableStages(): string[] {
    const own = this.user()?.department?.stage;
    if (own) return [own];
    const slug: Record<string, string> = {
      CUTTING: 'cutting', SEWING: 'sewing', WASHING: 'washing', LASER: 'laser', PACKING: 'packing', LOADING: 'loading',
    };
    return Object.keys(slug).filter((st) => this.can(`${slug[st]}.read`));
  }

  constructor() {
    // Session ended (refresh failed, user blocked…) → back to the Mini App login form.
    effect(() => {
      if (!this.auth.user() && this.state() === 'ready') {
        this.user.set(null);
        this.state.set('login');
      }
    });
  }

  can(...perms: string[]): boolean {
    const mine = this.user()?.permissions ?? [];
    if (mine.includes('*')) return true;
    return perms.some((p) => mine.includes(p));
  }

  hasStage(): boolean {
    return !!this.user()?.department?.stage;
  }

  isWarehouseUser(): boolean {
    return isWarehouseUser(this.user());
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
      this.message.set('');
      return;
    }

    if (this.auth.isAuthenticated()) {
      this.auth.me().subscribe({
        next: (u) => { this.user.set(u); this.state.set('ready'); },
        error: () => this.state.set('login'),
      });
    } else {
      this.state.set('login');
      this.message.set(this.i18n.t('ma_outside_telegram'));
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

  notifyProduction(): void {
    this.productionTick.update((n) => n + 1);
  }
}
