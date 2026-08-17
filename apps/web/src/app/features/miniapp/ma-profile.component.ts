import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { InitialsPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { MiniAppService } from './miniapp.service';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';

@Component({
  selector: 'app-ma-profile',
  standalone: true,
  imports: [IconComponent, TPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ma.user(); as u) {
      <div class="card card-pad">
        <div class="col gap-3" style="align-items:center;text-align:center">
          <span class="avatar lg">{{ u.firstName | initials: u.lastName }}</span>
          <div>
            <h2 style="font-size:17px">{{ u.fullName }}</h2>
            <div class="small text-3">{{ u.position || '—' }}</div>
          </div>
          <div class="row gap-2">
            <span class="badge badge-info">{{ u.role?.name }}</span>
            @if (u.department) { <span class="badge badge-neutral">{{ u.department.name }}</span> }
          </div>
        </div>

        <div class="divider"></div>
        <dl class="kv">
          <dt>{{ 'login' | t }}</dt><dd class="mono">{{ u.login }}</dd>
          <dt>{{ 'phone' | t }}</dt><dd class="mono">{{ u.phone }}</dd>
          @if (u.department?.stage) { <dt>{{ 'stage' | t }}</dt><dd>{{ 'stage_' + u.department!.stage | t }}</dd> }
        </dl>
      </div>

      <div class="card card-pad mt-3">
        <div class="small mb-3">{{ 'language' | t }}</div>
        <div class="lang-picker" role="group" [attr.aria-label]="'language' | t">
          @for (l of langs; track l.code) {
            <button
              type="button"
              class="lang-picker-item"
              [class.active]="i18n.lang() === l.code"
              (click)="setLang(l.code)"
            >
              <span class="lang-picker-code">{{ l.short }}</span>
              <span class="lang-picker-label">{{ ('lang_' + l.code) | t }}</span>
            </button>
          }
        </div>
      </div>

      <button class="btn btn-block mt-4" type="button" (click)="auth.logout(false); ma.state.set('login')">
        <ui-icon name="log-out" [size]="15" /> {{ 'logout' | t }}
      </button>
    }
  `,
  styles: [`dl.kv { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; } dl.kv dt { color: var(--text-3); } dl.kv dd { margin: 0; text-align: right; }`],
})
export class MaProfileComponent {
  readonly ma = inject(MiniAppService);
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly langs = LANG_OPTIONS;

  setLang(l: Lang): void { this.i18n.set(l); }
}
