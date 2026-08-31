import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { flagAsset } from '../../core/config/lang-options';
import type { Lang } from '../../core/models';

@Component({
  selector: 'ui-lang-flag',
  templateUrl: './lang-flag.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'lang-flag',
    '[attr.data-lang]': 'code()',
  },
})
export class LangFlagComponent {
  readonly code = input.required<Lang>();
  readonly src = computed(() => flagAsset(this.code()));
}
