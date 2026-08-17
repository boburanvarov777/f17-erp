import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { flagAsset } from '../../core/lang-options';
import type { Lang } from '../../core/models';

@Component({
  selector: 'ui-lang-flag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'lang-flag',
    '[attr.data-lang]': 'code()',
  },
  template: `<img [src]="src()" alt="" draggable="false" />`,
})
export class LangFlagComponent {
  readonly code = input.required<Lang>();
  readonly src = computed(() => flagAsset(this.code()));
}
