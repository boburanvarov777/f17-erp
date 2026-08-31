import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-loading',
  templateUrl: './loading.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingComponent {
  readonly count = input(6);
  readonly height = input(38);
  rows() { return Array.from({ length: this.count() }); }
}
