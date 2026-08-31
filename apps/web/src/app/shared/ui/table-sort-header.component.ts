import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Sort indicator for `table.data` headers — neutral icon when inactive, arrow when sorted. */
@Component({
  selector: 'ui-table-sort',
  templateUrl: './table-sort-header.component.html',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sort-head',
    '[class.sort-end]': "align() === 'end'",
  },
})
export class TableSortHeaderComponent {
  readonly active = input(false);
  readonly direction = input<'asc' | 'desc'>('asc');
  readonly align = input<'start' | 'end'>('start');
}
