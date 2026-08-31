import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-empty',
  templateUrl: './empty.component.html',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  templateUrl: './loading.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingComponent {
  readonly count = input(6);
  readonly height = input(38);
  rows() { return Array.from({ length: this.count() }); }
}
