import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { IconComponent } from '../../../shared/ui/icon.component';
import { LangSelectComponent } from '../../../shared/ui/lang-select.component';
import { deptLabel } from '../../../core/utils/dept-label';
import type { Department } from '../../../core/models';
import { I18nService } from '../../../core/services/i18n.service';
import type { Lang } from '../../../core/models';
import { getMiniAppHomeRoute, getMiniAppTabs } from '../config/miniapp-nav.config';
import { MiniAppService } from '../services/miniapp.service';
import { haptic } from '../utils/telegram';
import { FieldErrorsState, runValidation } from '../../../shared/utils/form-validate';
import { loginErrorKey, loginServerReason } from '../../../shared/utils/login-error';

@Component({
  selector: 'app-miniapp-shell',
  templateUrl: './miniapp-shell.component.html',
  styleUrl: './miniapp-shell.component.scss',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, LangSelectComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniAppShellComponent {
  readonly ma = inject(MiniAppService);
  readonly i18n = inject(I18nService);
  private router = inject(Router);

  login = '';
  password = '';
  departmentCode = '';
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly serverReason = signal<string | null>(null);
  readonly error = computed(() => this.serverReason() || (this.errorKey() ? this.i18n.t(this.errorKey()!) : ''));
  readonly fe = new FieldErrorsState();

  readonly tabs = computed(() => getMiniAppTabs(this.ma.user()));

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
    this.serverReason.set(null);
    this.ma.login(this.login.trim(), this.password, this.departmentCode || undefined).subscribe({
      next: (res) => {
        this.busy.set(false);
        haptic('success');
        // apply() opens the admin sections for the bot "Admin" account itself —
        // don't send it back to the Mini App home afterwards.
        this.ma.apply(res);
        void this.router.navigateByUrl(getMiniAppHomeRoute(res.user));
      },
      error: (e) => {
        this.busy.set(false);
        haptic('error');
        this.serverReason.set(loginServerReason(e));
        this.errorKey.set(loginErrorKey(e));
      },
    });
  }
}
