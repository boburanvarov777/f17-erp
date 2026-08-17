import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-empty',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <ui-icon [name]="icon()" [size]="34" [stroke]="1.4" />
      <h3>{{ resolvedTitle() }}</h3>
      @if (message()) { <div class="small">{{ message() }}</div> }
      <ng-content />
    </div>
  `,
})
export class EmptyComponent {
  private readonly i18n = inject(I18nService);
  readonly icon = input('info');
  readonly title = input('');
  readonly message = input('');
  readonly resolvedTitle = computed(() => this.title() || this.i18n.t('no_data'));
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
