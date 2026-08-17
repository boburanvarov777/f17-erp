import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';
import { TPipe } from '../pipes/t.pipe';
import { LangFlagComponent } from './lang-flag.component';

export type LangPickerVariant = 'compact' | 'segment' | 'grid';

@Component({
  selector: 'ui-lang-picker',
  standalone: true,
  imports: [TPipe, LangFlagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'grid') {
      <div class="lang-grid" role="group" [attr.aria-label]="'language' | t">
        @for (l of langs; track l.code) {
          <button
            type="button"
            class="lang-grid-item"
            [class.active]="current() === l.code"
            [attr.aria-pressed]="current() === l.code"
            (click)="pick(l.code)"
          >
            <ui-lang-flag [code]="l.code" />
            <span class="lang-grid-code">{{ l.short }}</span>
            <span class="lang-grid-label">{{ ('lang_' + l.code) | t }}</span>
          </button>
        }
      </div>
    } @else {
      <div
        class="lang-seg"
        [class.compact]="variant() === 'compact'"
        role="group"
        [attr.aria-label]="'language' | t"
      >
        @for (l of langs; track l.code) {
          <button
            type="button"
            class="lang-seg-btn"
            [class.active]="current() === l.code"
            [attr.aria-pressed]="current() === l.code"
            [attr.data-tip]="variant() === 'compact' ? (('lang_' + l.code) | t) : null"
            (click)="pick(l.code)"
          >
            <ui-lang-flag [code]="l.code" />
            <span class="lang-seg-code">{{ l.short }}</span>
            @if (variant() === 'segment') {
              <span class="lang-seg-label">{{ ('lang_' + l.code) | t }}</span>
            }
          </button>
        }
      </div>
    }
  `,
})
export class LangPickerComponent {
  readonly variant = input<LangPickerVariant>('segment');
  readonly current = input.required<Lang>();
  readonly changed = output<Lang>();

  readonly langs = LANG_OPTIONS;

  pick(code: Lang): void {
    if (code !== this.current()) this.changed.emit(code);
  }
}
