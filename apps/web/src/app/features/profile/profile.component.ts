import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { InitialsPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, IconComponent, TPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:860px">
      <div class="page-head"><div class="title">{{ 'profile' | t }}</div></div>

      @if (auth.user(); as u) {
        <div class="card card-pad mb-4">
          <div class="row gap-4">
            <span class="avatar lg">{{ u.firstName | initials: u.lastName }}</span>
            <div class="grow">
              <h2>{{ u.fullName }}</h2>
              <div class="text-3 small">{{ u.position || '—' }} · {{ u.department?.name || '—' }}</div>
              <div class="row gap-2 mt-2">
                <span class="badge badge-info">{{ u.role?.name }}</span>
                @if (u.telegramId) { <span class="badge badge-success"><ui-icon name="send" [size]="11" /> {{ 'telegram_linked' | t }}</span> }
              </div>
            </div>
          </div>
          <div class="divider"></div>
          <dl class="kv">
            <dt>{{ 'login' | t }}</dt><dd class="mono">{{ u.login }}</dd>
            <dt>{{ 'phone' | t }}</dt><dd class="mono">{{ u.phone }}</dd>
            <dt>{{ 'email' | t }}</dt><dd>{{ u.email || '—' }}</dd>
            <dt>{{ 'permissions' | t }}</dt><dd>{{ u.permissions.includes('*') ? ('full_access' | t) : i18n.t('permissions_count', { n: u.permissions.length }) }}</dd>
          </dl>
        </div>

        <div class="card card-pad mb-4">
          <h3 class="mb-4">{{ 'settings' | t }}</h3>
          <div class="row-between mb-4">
            <span class="small">{{ 'language' | t }}</span>
            <div class="row gap-1">
              @for (l of langs; track l.code) {
                <button
                  class="btn btn-sm lang-btn"
                  [class.btn-primary]="i18n.lang() === l.code"
                  type="button"
                  (click)="setLang(l.code)"
                >
                  <span class="lang-chip" [class]="l.flagClass">{{ l.short }}</span>
                  <span>{{ ('lang_' + l.code) | t }}</span>
                </button>
              }
            </div>
          </div>
          <div class="row-between">
            <span class="small">{{ 'theme' | t }}</span>
            <button class="btn btn-sm" type="button" (click)="theme.toggle()">
              <ui-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="15" />
              {{ (theme.theme() === 'dark' ? 'theme_dark' : 'theme_light') | t }}
            </button>
          </div>
        </div>

        <div class="card card-pad">
          <h3 class="mb-4">{{ 'change_password' | t }}</h3>
          <div class="form-grid">
            <div class="field" [class.field-invalid]="fe.has('currentPassword')">
              <label class="label">{{ 'current_password' | t }}</label>
              <input class="input" type="password" [(ngModel)]="currentPassword" (ngModelChange)="fe.clear('currentPassword')" />
              @if (fe.get('currentPassword'); as msg) { <div class="field-error">{{ msg }}</div> }
            </div>
            <div class="field" [class.field-invalid]="fe.has('newPassword')">
              <label class="label">{{ 'new_password' | t }}</label>
              <input class="input" type="password" [(ngModel)]="newPassword" (ngModelChange)="fe.clear('newPassword')" />
              @if (fe.get('newPassword'); as msg) { <div class="field-error">{{ msg }}</div> }
            </div>
          </div>
          @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }
          <button class="btn btn-primary mt-4" type="button" (click)="changePassword()" [disabled]="busy()">
            {{ 'save' | t }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`dl.kv { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 9px 16px; margin: 0; font-size: 13.5px; } dl.kv dt { color: var(--text-3); } dl.kv dd { margin: 0; }`],
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly theme = inject(ThemeService);
  private toast = inject(ToastService);

  currentPassword = '';
  newPassword = '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fe = new FieldErrorsState();
  readonly langs = LANG_OPTIONS;

  setLang(l: Lang): void { this.i18n.set(l); }

  changePassword(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'currentPassword', label: t('current_password'), value: this.currentPassword, required: true },
      { key: 'newPassword', label: t('new_password'), value: this.newPassword, required: true, minLength: 6 },
    ], t))) return;

    this.busy.set(true);
    this.error.set('');
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.busy.set(false);
        this.currentPassword = '';
        this.newPassword = '';
        this.toast.success(this.i18n.t('saved'), this.i18n.t('relogin_hint'));
        setTimeout(() => this.auth.logout(), 1400);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.message || this.i18n.t('error'));
      },
    });
  }
}
