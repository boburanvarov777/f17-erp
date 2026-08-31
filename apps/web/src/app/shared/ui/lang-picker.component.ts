import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LANG_OPTIONS } from '../../core/lang-options';
import type { Lang } from '../../core/models';
import { TPipe } from '../pipes/t.pipe';
import { LangFlagComponent } from './lang-flag.component';

export type LangPickerVariant = 'compact' | 'segment' | 'grid';

@Component({
  selector: 'ui-lang-picker',
  templateUrl: './lang-picker.component.html',
  standalone: true,
  imports: [TPipe, LangFlagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
