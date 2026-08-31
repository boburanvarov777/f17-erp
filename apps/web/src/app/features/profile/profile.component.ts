import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { InitialsPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { LangPickerComponent } from '../../shared/ui/lang-picker.component';
import type { Lang } from '../../core/models';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, LangPickerComponent, TPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
