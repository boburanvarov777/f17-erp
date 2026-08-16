import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<string, Tone> = {
  // orders
  NEW: 'info', CONFIRMED: 'info', IN_PRODUCTION: 'warning', READY: 'success',
  LOADING: 'info', COMPLETED: 'success', CANCELLED: 'neutral', DELAYED: 'danger',
  // stages
  NOT_STARTED: 'neutral', WAITING: 'neutral', IN_PROGRESS: 'warning', BLOCKED: 'danger',
  // users / models
  ACTIVE: 'success', ARCHIVED: 'neutral', DRAFT: 'neutral',
  // warehouse
  OK: 'success', LOW: 'warning', OUT: 'danger',
  // shipments
  LOADED: 'info', SHIPPED: 'success',
  // tasks
  TODO: 'neutral', DONE: 'success',
  // priority
  LOW_P: 'neutral', NORMAL: 'neutral', HIGH: 'warning', URGENT: 'danger',
};

@Component({
  selector: 'ui-status',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge-' + tone()"><i class="dot"></i>{{ prefix() + value() | t }}</span>`,
})
export class StatusBadgeComponent {
  readonly value = input.required<string>();
  readonly prefix = input('st_');
  readonly tone = computed<Tone>(() => TONES[this.value()] ?? 'neutral');
}

@Component({
  selector: 'ui-priority',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge-' + tone()">{{ 'pr_' + value() | t }}</span>`,
})
export class PriorityBadgeComponent {
  readonly value = input.required<string>();
  readonly tone = computed<Tone>(() => ({ LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' } as const)[this.value()] ?? 'neutral');
}
