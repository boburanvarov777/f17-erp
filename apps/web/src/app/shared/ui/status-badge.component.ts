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

const STAGE_THEMES: Record<string, string> = {
  CUTTING: 'cutting', SEWING: 'sewing', WASHING: 'washing',
  LASER: 'laser', PACKING: 'packing', LOADING: 'loading',
};

@Component({
  selector: 'ui-status',
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
  standalone: true,
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly value = input.required<string>();
  readonly prefix = input('st_');
  readonly wrap = input(false);
  readonly light = input(false);
  private readonly isStage = computed(() => this.prefix() === 'stage_');
  readonly tone = computed<Tone>(() => TONES[this.value()] ?? 'neutral');
  readonly theme = computed(() => {
    if (!this.isStage()) return `badge-${this.tone()}`;
    const stage = STAGE_THEMES[this.value()];
    return stage ? `stage stage-${stage}` : 'badge-neutral';
  });
  readonly icon = computed(() => {
    if (this.isStage()) return STAGE_ICONS[this.value()] ?? 'circle-dot';
    return ICONS[this.value()] ?? 'circle-dot';
  });
}

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
