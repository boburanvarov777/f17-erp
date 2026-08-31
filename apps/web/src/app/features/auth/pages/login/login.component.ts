import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { I18nService } from '../../../../core/services/i18n.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { LangPickerComponent } from '../../../../shared/ui/lang-picker.component';
import type { Lang } from '../../../../core/models';
import { FieldErrorsState, runValidation } from '../../../../shared/utils/form-validate';
import { loginErrorKey } from '../../../../shared/utils/login-error';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  standalone: true,
  imports: [FormsModule, TPipe, IconComponent, LangPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly i18n = inject(I18nService);
  readonly theme = inject(ThemeService);

  login = '';
  password = '';
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly error = computed(() => (this.errorKey() ? this.i18n.t(this.errorKey()!) : ''));
  readonly fe = new FieldErrorsState();
  readonly year = new Date().getFullYear();

  setLang(l: Lang): void { this.i18n.set(l); }

  submit(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'login', label: t('login'), value: this.login, required: true },
      { key: 'password', label: t('password'), value: this.password, required: true },
    ], t)) || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    this.auth.login(this.login.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        void this.router.navigateByUrl(redirect && !redirect.includes('login') ? redirect : '/dashboard');
      },
      error: (e) => {
        this.busy.set(false);
        this.errorKey.set(loginErrorKey(e));
      },
    });
  }
}
