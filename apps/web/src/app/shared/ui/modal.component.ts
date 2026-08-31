import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-modal',
  templateUrl: './modal.component.html',
  standalone: true,
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  readonly title = input('');
  readonly subtitle = input('');
  readonly size = input<'md' | 'lg' | 'xl' | 'full'>('md');
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  onBackdrop(e: MouseEvent): void {
    if (this.closeOnBackdrop() && (e.target as HTMLElement).classList.contains('modal-backdrop')) this.closed.emit();
  }
}
