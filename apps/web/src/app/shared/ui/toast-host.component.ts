import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { ToastItemComponent } from './toast-item.component';

@Component({
  selector: 'ui-toast-host',
  standalone: true,
  imports: [ToastItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host no-print">
      @for (t of toast.toasts(); track t.id) {
        <ui-toast-item [t]="t" (closed)="toast.dismiss($event)" />
      }
    </div>
  `,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);
}
