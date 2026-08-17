import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<string, Tone> = {
  NEW: 'info', CONFIRMED: 'info', IN_PRODUCTION: 'warning', READY: 'success',
  LOADING: 'info', COMPLETED: 'success', CANCELLED: 'neutral', DELAYED: 'danger',
  NOT_STARTED: 'neutral', WAITING: 'neutral', IN_PROGRESS: 'warning', BLOCKED: 'danger',
  ACTIVE: 'success', ARCHIVED: 'neutral', DRAFT: 'neutral',
  OK: 'success', LOW: 'warning', OUT: 'danger',
  LOADED: 'info', SHIPPED: 'success',
  TODO: 'neutral', DONE: 'success',
  PENDING: 'warning', APPROVED: 'success', SENT: 'info', REJECTED: 'danger',
  BLOCKED_ACCOUNT: 'danger',
};

const ICONS: Record<string, string> = {
  NEW: 'circle-dot', CONFIRMED: 'check-circle', IN_PRODUCTION: 'shirt', READY: 'package',
  LOADING: 'truck', COMPLETED: 'check-circle', CANCELLED: 'ban', DELAYED: 'alert-triangle',
  NOT_STARTED: 'clock', WAITING: 'clock', IN_PROGRESS: 'trending-up', BLOCKED: 'ban',
  ACTIVE: 'check-circle', ARCHIVED: 'archive', DRAFT: 'pencil',
  OK: 'check-circle', LOW: 'alert-triangle', OUT: 'alert-circle',
  LOADED: 'package', SHIPPED: 'truck',
  TODO: 'list-checks', DONE: 'check',
  PENDING: 'clock', APPROVED: 'check-circle', SENT: 'send', REJECTED: 'x',
  BLOCKED_ACCOUNT: 'ban',
};

const STAGE_ICONS: Record<string, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

@Component({
  selector: 'ui-status',
  standalone: true,
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge status-badge" [class.wrap]="wrap()" [class.light]="light()" [class]="'badge-' + tone()">
      <ui-icon [name]="icon()" [size]="11" />
      <span>{{ prefix() + value() | t }}</span>
    </span>
  `,
  styles: [`
    .status-badge { gap: 5px; }
    .status-badge.wrap { white-space: normal; height: auto; min-height: 22px; line-height: 1.25; padding-block: 3px; }
    .status-badge.light {
      background: var(--surface);
      box-shadow: var(--sh-1);
      font-weight: 600;
    }
    .status-badge.light.badge-success { color: var(--success); border-color: var(--success-br); }
    .status-badge.light.badge-warning { color: var(--warning); border-color: var(--warning-br); }
    .status-badge.light.badge-danger { color: var(--danger); border-color: var(--danger-br); }
    .status-badge.light.badge-info { color: var(--info); border-color: var(--info-br); }
    .status-badge.light.badge-neutral { color: var(--text-2); border-color: var(--border-strong); }
    .status-badge ui-icon { flex-shrink: 0; opacity: .92; }
  `],
})
export class StatusBadgeComponent {
  readonly value = input.required<string>();
  readonly prefix = input('st_');
  readonly wrap = input(false);
  readonly light = input(false);
  readonly tone = computed<Tone>(() => {
    if (this.prefix() === 'stage_') return 'neutral';
    return TONES[this.value()] ?? 'neutral';
  });
  readonly icon = computed(() => {
    if (this.prefix() === 'stage_') return STAGE_ICONS[this.value()] ?? 'circle-dot';
    return ICONS[this.value()] ?? 'circle-dot';
  });
}

@Component({
  selector: 'ui-priority',
  standalone: true,
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge status-badge" [class]="'badge-' + tone()">
      <ui-icon [name]="icon()" [size]="11" />
      <span>{{ 'pr_' + value() | t }}</span>
    </span>
  `,
  styles: [`
    .status-badge { gap: 5px; }
    .status-badge ui-icon { flex-shrink: 0; opacity: .92; }
  `],
})
export class PriorityBadgeComponent {
  readonly value = input.required<string>();
  readonly tone = computed<Tone>(() => ({ LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' } as const)[this.value()] ?? 'neutral');
  readonly icon = computed(() => ({ LOW: 'chevron-down', NORMAL: 'minus', HIGH: 'chevron-up', URGENT: 'alert-triangle' } as const)[this.value()] ?? 'minus');
}
