import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-empty',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <ui-icon [name]="icon()" [size]="34" [stroke]="1.4" />
      <h3>{{ title() }}</h3>
      @if (message()) { <div class="small">{{ message() }}</div> }
      <ng-content />
    </div>
  `,
})
export class EmptyComponent {
  readonly icon = input('info');
  readonly title = input('Ma’lumot yo‘q');
  readonly message = input('');
}

@Component({
  selector: 'ui-loading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="col gap-2" style="padding:16px">
      @for (r of rows(); track $index) {
        <div class="skeleton" [style.height.px]="height()"></div>
      }
    </div>
  `,
})
export class LoadingComponent {
  readonly count = input(6);
  readonly height = input(38);
  rows() { return Array.from({ length: this.count() }); }
}
