import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TPipe } from '../../pipes/t.pipe';
import { IconComponent } from '../icon.component';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'ui-priority',
  templateUrl: './priority-badge.component.html',
  styleUrl: './priority-badge.component.scss',
  standalone: true,
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityBadgeComponent {
  readonly value = input.required<string>();
  readonly tone = computed<Tone>(() => ({ LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' } as const)[this.value()] ?? 'neutral');
  readonly icon = computed(() => ({ LOW: 'chevron-down', NORMAL: 'minus', HIGH: 'chevron-up', URGENT: 'alert-triangle' } as const)[this.value()] ?? 'minus');
}
