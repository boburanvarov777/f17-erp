import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import type { Lang } from '../../core/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth">
      <!-- brand panel -->
      <div class="panel">
        <div class="panel-inner">
          <div class="mark">F17</div>
          <h1 class="wordmark">F17 JEANS<br /><span>&amp; ZARINA DENIM</span></h1>
          <p class="tag">Ishlab chiqarish boshqaruv tizimi — zakazdan ortishgacha bitta ekranda.</p>

          <ul class="feats">
            <li><ui-icon name="clipboard-list" [size]="16" /> Zakazlar va modellar</li>
            <li><ui-icon name="scissors" [size]="16" /> 6 ta ishlab chiqarish bosqichi</li>
            <li><ui-icon name="boxes" [size]="16" /> Ombor va materiallar</li>
            <li><ui-icon name="send" [size]="16" /> Telegram bot &amp; Mini App</li>
          </ul>
        </div>
        <div class="panel-foot">© {{ year }} F17 Jeans · Melon Fashion Group</div>
      </div>

      <!-- form -->
      <div class="form-side">
        <div class="topline">
          <button class="btn btn-ghost btn-sm" type="button" (click)="cycleLang()">
            <ui-icon name="globe" [size]="15" />
            <span style="text-transform:uppercase;font-weight:600">{{ i18n.lang() }}</span>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="theme.toggle()">
            <ui-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="15" />
          </button>
        </div>

        <form class="form" (ngSubmit)="submit()">
          <div class="mark small-mark">F17</div>
          <h2>{{ 'login_title' | t }}</h2>
          <p class="text-3 small mb-6">{{ 'login_subtitle' | t }}</p>

          <div class="field mb-4">
            <label class="label" for="login">{{ 'login' | t }}</label>
            <input id="login" class="input" name="login" [(ngModel)]="login" autocomplete="username"
                   required autofocus [disabled]="busy()" />
          </div>

          <div class="field mb-4">
            <label class="label" for="password">{{ 'password' | t }}</label>
            <div style="position:relative">
              <input id="password" class="input" name="password" [type]="show() ? 'text' : 'password'"
                     [(ngModel)]="password" autocomplete="current-password" required [disabled]="busy()" />
              <button type="button" class="peek" (click)="show.set(!show())" tabindex="-1">
                <ui-icon [name]="show() ? 'ban' : 'eye'" [size]="15" />
              </button>
            </div>
          </div>

          @if (error()) {
            <div class="badge badge-danger mb-4" style="width:100%;justify-content:flex-start;padding:9px 12px;border-radius:var(--r)">
              <ui-icon name="alert-circle" [size]="15" /> {{ error() }}
            </div>
          }

          <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy() || !login || !password">
            @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'sign_in' | t }} }
          </button>

          <div class="hint">
            <ui-icon name="info" [size]="14" />
            <span>Login va parolni administrator beradi. Telegram orqali mustaqil ro‘yxatdan o‘tish mumkin emas.</span>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .auth { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); min-height: 100vh; }

    .panel {
      background: linear-gradient(150deg, #16305a 0%, #101828 55%, #0b1120 100%);
      color: #fff; padding: 48px 52px; display: flex; flex-direction: column; justify-content: space-between;
      position: relative; overflow: hidden;
    }
    .panel::before {
      content: ''; position: absolute; inset: 0;
      background:
        radial-gradient(900px 420px at 12% 8%, rgba(90,140,220,.20), transparent 62%),
        repeating-linear-gradient(115deg, rgba(255,255,255,.028) 0 2px, transparent 2px 7px);
      pointer-events: none;
    }
    .panel-inner { position: relative; max-width: 430px; }
    .mark {
      width: 54px; height: 54px; border-radius: 14px;
      background: linear-gradient(135deg, #3f6cba, #1b3a6b);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 17px; letter-spacing: .02em; color: #fff;
      box-shadow: 0 8px 26px rgba(0,0,0,.35);
    }
    .wordmark { margin: 26px 0 12px; font-size: 33px; font-weight: 600; letter-spacing: .05em; line-height: 1.18; }
    .wordmark span { font-weight: 300; letter-spacing: .13em; font-size: 25px; opacity: .82; }
    .tag { color: rgba(255,255,255,.66); font-size: 14.5px; line-height: 1.6; max-width: 380px; }
    .feats { list-style: none; padding: 0; margin: 34px 0 0; display: flex; flex-direction: column; gap: 13px; }
    .feats li { display: flex; align-items: center; gap: 11px; color: rgba(255,255,255,.78); font-size: 13.5px; }
    .feats svg { color: #7ea6e8; }
    .panel-foot { position: relative; color: rgba(255,255,255,.35); font-size: 12px; }

    .form-side { background: var(--surface); display: flex; flex-direction: column; padding: 20px; }
    .topline { display: flex; justify-content: flex-end; gap: 4px; }
    .form { margin: auto; width: 100%; max-width: 372px; padding-bottom: 8vh; }
    .small-mark { width: 42px; height: 42px; border-radius: 11px; font-size: 13px; margin-bottom: 20px; display: none; }
    .form h2 { font-size: 23px; letter-spacing: -.02em; margin-bottom: 4px; }
    .peek { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: none; background: none; color: var(--text-3); cursor: pointer; padding: 7px; }
    .hint { display: flex; align-items: flex-start; gap: 8px; margin-top: 22px; padding: 12px 13px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r); font-size: 12px; color: var(--text-3); line-height: 1.5; }
    .hint svg { flex: 0 0 auto; margin-top: 1px; }

    @media (max-width: 900px) {
      .auth { grid-template-columns: 1fr; }
      .panel { display: none; }
      .small-mark { display: flex; }
    }
  `],
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
  readonly error = signal('');
  readonly year = new Date().getFullYear();

  cycleLang(): void {
    const order: Lang[] = ['uz', 'ru', 'en'];
    this.i18n.set(order[(order.indexOf(this.i18n.lang()) + 1) % order.length]);
  }

  submit(): void {
    if (!this.login || !this.password || this.busy()) return;
    this.busy.set(true);
    this.error.set('');

    this.auth.login(this.login.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        void this.router.navigateByUrl(redirect && !redirect.includes('login') ? redirect : '/dashboard');
      },
      error: (e) => {
        this.busy.set(false);
        // Distinguish "backend is down" from "wrong credentials" — otherwise a
        // stopped API looks exactly like a typo.
        if (e?.status === 0) {
          this.error.set('Server bilan aloqa yo‘q — API ishga tushganini tekshiring (http://localhost:3000/docs)');
          return;
        }
        if (e?.status === 404) {
          this.error.set('API topilmadi. Angular proxy yoki APP URL noto‘g‘ri sozlangan.');
          return;
        }
        const msg = e?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(', ') : msg || this.i18n.t('login_error'));
      },
    });
  }
}
