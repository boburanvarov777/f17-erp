import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-modal',
  standalone: true,
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="onBackdrop($event)">
      <div class="modal" [class.lg]="size() === 'lg'" [class.xl]="size() === 'xl'" role="dialog" aria-modal="true">
        <div class="modal-head row-between">
          <div>
            <h2>{{ title() }}</h2>
            @if (subtitle()) { <div class="small text-3 mt-2">{{ subtitle() }}</div> }
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="closed.emit()" [attr.data-tip]="'close' | t">
            <ui-icon name="x" [size]="17" />
          </button>
        </div>
        <div class="modal-body"><ng-content /></div>
        <div class="modal-foot"><ng-content select="[footer]" /></div>
      </div>
    </div>
  `,
})
export class ModalComponent {
  readonly title = input('');
  readonly subtitle = input('');
  readonly size = input<'md' | 'lg' | 'xl'>('md');
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  onBackdrop(e: MouseEvent): void {
    if (this.closeOnBackdrop() && (e.target as HTMLElement).classList.contains('modal-backdrop')) this.closed.emit();
  }
}
