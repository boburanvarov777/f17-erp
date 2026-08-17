import { ChangeDetectionStrategy, Component, HostListener, input, output, signal } from '@angular/core';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';
import { LangFlagComponent } from './lang-flag.component';

@Component({
  selector: 'ui-lang-select',
  standalone: true,
  imports: [TPipe, IconComponent, LangFlagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lang-select" [class.open]="open()">
      <button
        type="button"
        class="lang-select-trigger"
        [attr.aria-expanded]="open()"
        [attr.aria-haspopup]="'listbox'"
        (click)="toggle()"
      >
        <ui-lang-flag [code]="current()" />
        <span class="lang-select-label">{{ ('lang_' + current()) | t }}</span>
        <ui-icon name="chevron-down" [size]="14" class="lang-select-chevron" />
      </button>

      @if (open()) {
        <div class="lang-select-menu" role="listbox" [attr.aria-label]="'language' | t">
          @for (l of langs; track l.code) {
            <button
              type="button"
              class="lang-select-item"
              role="option"
              [class.active]="current() === l.code"
              [attr.aria-selected]="current() === l.code"
              (click)="pick(l.code)"
            >
              <ui-lang-flag [code]="l.code" />
              <span class="grow">{{ ('lang_' + l.code) | t }}</span>
              @if (current() === l.code) { <ui-icon name="check" [size]="14" /> }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class LangSelectComponent {
  readonly current = input.required<Lang>();
  readonly changed = output<Lang>();

  readonly langs = LANG_OPTIONS;
  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  pick(code: Lang): void {
    this.open.set(false);
    if (code !== this.current()) this.changed.emit(code);
  }

  @HostListener('document:click', ['$event'])
  onOutside(e: MouseEvent): void {
    if (!this.open()) return;
    const el = e.target as HTMLElement;
    if (!el.closest('.lang-select')) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.open.set(false);
  }
}
