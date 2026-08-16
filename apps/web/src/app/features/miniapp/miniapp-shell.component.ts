import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

@Component({
  selector: 'app-miniapp-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ma">
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
            @if (ma.message()) { <div class="small text-3 mt-2" style="text-align:center">{{ ma.message() }}</div> }

            <div class="col gap-3 mt-6" style="width:100%;max-width:320px">
              <div class="field">
                <label class="label">{{ 'department' | t }}</label>
                <select class="select" [(ngModel)]="departmentCode">
                  <option value="">{{ 'select_department' | t }}</option>
                  @for (d of ma.departments(); track d.id) { <option [value]="d.code">{{ d.nameUz }}</option> }
                </select>
              </div>
              <div class="field">
                <label class="label">{{ 'login' | t }}</label>
                <input class="input" [(ngModel)]="login" autocomplete="username" />
              </div>
              <div class="field">
                <label class="label">{{ 'password' | t }}</label>
                <div class="pass-wrap">
                  <input class="input" [type]="show() ? 'text' : 'password'" [(ngModel)]="password" autocomplete="current-password" />
                  <button type="button" class="peek" (click)="show.set(!show())" tabindex="-1">
                    <ui-icon [name]="show() ? 'ban' : 'eye'" [size]="15" />
                  </button>
                </div>
              </div>
              @if (error()) { <div class="err-text">{{ error() }}</div> }
              <button class="btn btn-primary btn-lg btn-block" type="button" (click)="submit()" [disabled]="busy() || !login || !password">
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
    .ma { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
    .ma-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .mark { width: 56px; height: 56px; border-radius: 15px; background: linear-gradient(135deg, #3f6cba, #1b3a6b); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; box-shadow: 0 8px 22px rgba(27,58,107,.35); }
    .ma-body { flex: 1; padding: 14px 14px 82px; overflow-y: auto; }
    .ma-nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
      display: grid;
      background: var(--surface); border-top: 1px solid var(--border);
      padding: 7px 0 max(7px, env(safe-area-inset-bottom));
    }
    .ma-nav a { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 5px 2px; color: var(--text-3); text-decoration: none; font-size: 10px; font-weight: 500; text-align: center; line-height: 1.15; }
    .ma-nav a.on { color: var(--primary-500); }
    .ma-nav a:hover { text-decoration: none; }
    .pass-wrap { position: relative; }
    .peek { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: none; background: none; color: var(--text-3); cursor: pointer; padding: 7px; }
  `],
})
export class MiniAppShellComponent {
  readonly ma = inject(MiniAppService);

  login = '';
  password = '';
  departmentCode = '';
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly tabs = computed(() => {
    const tabs: { link: string; icon: string; label: string }[] = [
      { link: '/miniapp/home', icon: 'layout-dashboard', label: 'nav_dashboard' },
    ];
    if (this.ma.isAdminPanel()) {
      tabs.push({ link: '/miniapp/manage', icon: 'settings', label: 'ma_manage' });
    }
    if (this.ma.hasStage()) {
      tabs.push({ link: '/miniapp/report', icon: 'plus', label: 'ma_report' });
    }
    tabs.push({ link: '/miniapp/tasks', icon: 'list-checks', label: 'ma_my_work' });
    if (this.ma.hasMenuNav()) {
      tabs.push({ link: '/miniapp/menu', icon: 'menu', label: 'ma_menu' });
    }
    tabs.push({ link: '/miniapp/profile', icon: 'user', label: 'ma_profile' });
    return tabs;
  });

  constructor() { this.ma.init(); }

  tap(): void { haptic('success'); }

  submit(): void {
    this.busy.set(true);
    this.error.set('');
    this.ma.login(this.login.trim(), this.password, this.departmentCode || undefined).subscribe({
      next: (res) => { this.busy.set(false); this.ma.apply(res); haptic('success'); },
      error: (e) => {
        this.busy.set(false);
        haptic('error');
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(', ') : m || 'Xatolik');
      },
    });
  }
}
