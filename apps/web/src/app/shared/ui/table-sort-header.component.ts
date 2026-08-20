import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Sort indicator for `table.data` headers — neutral icon when inactive, arrow when sorted. */
@Component({
  selector: 'ui-table-sort',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="sort-label"><ng-content /></span>
    @if (active()) {
      <ui-icon [name]="direction() === 'asc' ? 'arrow-up' : 'arrow-down'" [size]="13" class="sort-icon active" />
    } @else {
      <ui-icon name="arrow-up-down" [size]="13" class="sort-icon" />
    }
  `,
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
