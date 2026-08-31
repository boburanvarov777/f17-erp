import { ChangeDetectionStrategy, Component, HostListener, input, output, signal } from '@angular/core';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';
import { LangFlagComponent } from './lang-flag.component';

@Component({
  selector: 'ui-lang-select',
  templateUrl: './lang-select.component.html',
  standalone: true,
  imports: [TPipe, IconComponent, LangFlagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
