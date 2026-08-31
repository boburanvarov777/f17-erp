import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { ToastItemComponent } from './toast-item.component';

@Component({
  selector: 'ui-toast-host',
  templateUrl: './toast-host.component.html',
  standalone: true,
  imports: [ToastItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);
}
