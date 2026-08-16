import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-toast-host',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host no-print">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.type">
          <span [style.color]="t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--info)'">
            <ui-icon [name]="t.type === 'success' ? 'check-circle' : t.type === 'error' ? 'alert-circle' : 'info'" [size]="17" />
          </span>
          <div class="grow">
            <div style="font-weight:500;font-size:13.5px">{{ t.title }}</div>
            @if (t.body) { <div class="small text-3">{{ t.body }}</div> }
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="toast.dismiss(t.id)">
            <ui-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);
}
