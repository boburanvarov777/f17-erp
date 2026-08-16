import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';
import { ModalComponent } from './modal.component';

/**
 * Business-aware confirmation — states the entity by name and what happens to
 * related data, never a bare "Are you sure?".
 */
@Component({
  selector: 'ui-confirm',
  standalone: true,
  imports: [ModalComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-modal [title]="title()" (closed)="cancelled.emit()">
      <div class="row gap-3" style="align-items:flex-start">
        <div class="center" [style.color]="danger() ? 'var(--danger)' : 'var(--warning)'"
             [style.background]="danger() ? 'var(--danger-bg)' : 'var(--warning-bg)'"
             style="width:38px;height:38px;border-radius:50%;flex:0 0 auto">
          <ui-icon name="alert-triangle" [size]="19" />
        </div>
        <div>
          <div style="font-size:14.5px">{{ message() }}</div>
          @if (note()) { <div class="small text-3 mt-2">{{ note() }}</div> }
        </div>
      </div>
      <div footer>
        <button class="btn" type="button" (click)="cancelled.emit()" [attr.data-tip]="'cancel' | t">{{ 'cancel' | t }}</button>
        <button class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()" type="button" (click)="confirmed.emit()" [attr.data-tip]="confirmLabel()">
          {{ confirmLabel() }}
        </button>
      </div>
    </ui-modal>
  `,
})
export class ConfirmComponent {
  readonly title = input('Tasdiqlash');
  readonly message = input('');
  readonly note = input('');
  readonly confirmLabel = input('OK');
  readonly danger = input(true);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
