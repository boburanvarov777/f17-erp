import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';
import { ModalComponent } from './modal.component';

/**
 * Business-aware confirmation — states the entity by name and what happens to
 * related data, never a bare "Are you sure?".
 */
@Component({
  selector: 'ui-confirm',
  templateUrl: './confirm.component.html',
  standalone: true,
  imports: [ModalComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmComponent {
  private readonly i18n = inject(I18nService);
  readonly title = input('');
  readonly message = input('');
  readonly note = input('');
  readonly confirmLabel = input('');
  readonly danger = input(true);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly resolvedTitle = computed(() => this.title() || this.i18n.t('confirm'));
  readonly resolvedConfirmLabel = computed(() => this.confirmLabel() || this.i18n.t('yes'));
}
