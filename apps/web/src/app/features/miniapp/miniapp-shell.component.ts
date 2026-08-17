import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { LangSelectComponent } from '../../shared/ui/lang-select.component';
import { deptLabel } from '../../core/dept-label';
import type { Department } from '../../core/models';
import { I18nService } from '../../core/services/i18n.service';
import type { Lang } from '../../core/models';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';
import { loginErrorKey } from '../../shared/utils/login-error';

@Component({
  selector: 'app-miniapp-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, LangSelectComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ma">
      @if (ma.state() !== 'loading') {
        <div class="ma-topbar">
          <ui-lang-select [current]="i18n.lang()" (changed)="setLang($event)" />
        </div>
      }

      @switch (ma.state()) {
        @case ('loading') {
          <div class="ma-center">
            <div class="mark">F17</div>
            <span class="spinner mt-4"></span>
            <div class="small text-3 mt-3">{{ 'loading' | t }}</div>
          </div>
        }

        @case ('login') {
          <div class="ma-center" style="padding:24px">
            <div class="mark">F17</div>
            <h2 class="mt-4">{{ 'ma_title' | t }}</h2>
            <p class="small text-3 mt-2" style="text-align:center;max-width:320px">{{ ma.message() || ('ma_login_prompt' | t) }}</p>

            <div class="col gap-3 mt-5" style="width:100%;max-width:320px">
              <div class="field" [class.field-invalid]="fe.has('departmentCode')">
                <label class="label">{{ 'department' | t }}</label>
                <select class="select" [(ngModel)]="departmentCode" (ngModelChange)="fe.clear('departmentCode')">
                  <option value="" disabled>{{ 'select_department' | t }}</option>
                  @for (d of ma.departments(); track d.id) { <option [value]="d.code">{{ deptName(d) }}</option> }
                </select>
                @if (fe.get('departmentCode'); as msg) { <div class="field-error">{{ msg }}</div> }
              </div>
              <div class="field" [class.field-invalid]="fe.has('login')">
                <label class="label">{{ 'login' | t }}</label>
                <input class="input" [(ngModel)]="login" autocomplete="username" (ngModelChange)="fe.clear('login')" [placeholder]="'login' | t" />
                @if (fe.get('login'); as msg) { <div class="field-error">{{ msg }}</div> }
              </div>
              <div class="field" [class.field-invalid]="fe.has('password')">
                <label class="label">{{ 'password' | t }}</label>
                <div class="pass-wrap">
                  <input class="input" [type]="show() ? 'text' : 'password'" [(ngModel)]="password" autocomplete="current-password" (ngModelChange)="fe.clear('password')" [placeholder]="'password' | t" />
                  <button type="button" class="peek" (click)="toggleShow()" tabindex="-1" [attr.aria-label]="show() ? ('hide_password' | t) : ('show_password' | t)">
                    <ui-icon [name]="show() ? 'eye-off' : 'eye'" [size]="16" />
                  </button>
                </div>
                @if (fe.get('password'); as msg) { <div class="field-error">{{ msg }}</div> }
              </div>
              @if (errorKey()) { <div class="err-text">{{ error() }}</div> }
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="submit()" [disabled]="busy()">
                @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'sign_in' | t }} }
              </button>
            </div>
          </div>
        }

        @case ('ready') {
          <main class="ma-body"><router-outlet /></main>
          <nav class="ma-nav" [style.gridTemplateColumns]="'repeat(' + tabs().length + ', 1fr)'">
            @for (t of tabs(); track t.link) {
              <a [routerLink]="t.link" routerLinkActive="on" (click)="tap()">
                <ui-icon [name]="t.icon" [size]="20" />
                <span>{{ t.label | t }}</span>
              </a>
            }
          </nav>
        }

        @default {
          <div class="ma-center" style="padding:24px;text-align:center">
            <ui-icon name="alert-circle" [size]="40" />
            <div class="mt-3">{{ 'ma_auth_error' | t }}</div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .ma { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); position: relative; }
    .ma-topbar {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 40;
      padding: 10px 12px;
      padding-top: max(10px, env(safe-area-inset-top));
    }
    .ma-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 48px; }
    .mark { width: 56px; height: 56px; border-radius: 15px; background: linear-gradient(135deg, #3f6cba, #1b3a6b); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; box-shadow: 0 8px 22px rgba(27,58,107,.35); }
    .ma-body { flex: 1; padding: 56px 14px 82px; overflow-y: auto; }
    .ma-nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
      display: grid;
      background: var(--surface); border-top: 1px solid var(--border);
      padding: 7px 0 max(7px, env(safe-area-inset-bottom));
    }
    .ma-nav a { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px 2px; color: var(--text-3); text-decoration: none; font-size: 10px; font-weight: 500; text-align: center; line-height: 1.15; }
    .ma-nav a.on { color: var(--primary-500); }
    .ma-nav a:hover { text-decoration: none; }
  `],
})
export class MiniAppShellComponent {
  readonly ma = inject(MiniAppService);
  readonly i18n = inject(I18nService);

  login = '';
  password = '';
  departmentCode = '';
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly error = computed(() => (this.errorKey() ? this.i18n.t(this.errorKey()!) : ''));
  readonly fe = new FieldErrorsState();

  readonly tabs = computed(() => {
    const tabs: { link: string; icon: string; label: string }[] = [
      { link: '/miniapp/home', icon: 'clipboard-list', label: 'ma_home' },
    ];
    if (this.ma.seesManageTab()) {
      tabs.push({ link: '/miniapp/manage', icon: 'users', label: 'ma_team' });
    }
    if (this.ma.hasStage()) {
      tabs.push({ link: '/miniapp/report', icon: 'scissors', label: 'ma_orders' });
    }
    tabs.push({ link: '/miniapp/tasks', icon: 'list-checks', label: 'ma_tasks' });
    tabs.push({ link: '/miniapp/profile', icon: 'user', label: 'ma_profile' });
    return tabs;
  });

  constructor() { this.ma.init(); }

  deptName(d: Department): string { return deptLabel(d, this.i18n.lang()); }

  setLang(l: Lang): void { this.i18n.set(l); }

  toggleShow(): void { this.show.set(!this.show()); }

  tap(): void { haptic('success'); }

  submit(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'departmentCode', label: t('department'), value: this.departmentCode, required: true },
      { key: 'login', label: t('login'), value: this.login, required: true },
      { key: 'password', label: t('password'), value: this.password, required: true },
    ], t))) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.ma.login(this.login.trim(), this.password, this.departmentCode || undefined).subscribe({
      next: (res) => { this.busy.set(false); this.ma.apply(res); haptic('success'); },
      error: (e) => {
        this.busy.set(false);
        haptic('error');
        this.errorKey.set(loginErrorKey(e));
      },
    });
  }
}
