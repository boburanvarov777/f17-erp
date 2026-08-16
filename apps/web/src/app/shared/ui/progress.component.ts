import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'ui-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="col gap-1" style="min-width:96px">
      @if (showLabel()) {
        <div class="row-between tiny text-3">
          <span>{{ value() }} / {{ max() }}</span>
          <span class="bold" [style.color]="color()">{{ pct() }}%</span>
        </div>
      }
      <div class="progress" [class]="tone()"><i [style.width.%]="pct()"></i></div>
    </div>
  `,
})
export class ProgressComponent {
  readonly value = input(0);
  readonly max = input(100);
  readonly late = input(false);
  readonly showLabel = input(true);

  readonly pct = computed(() => {
    const m = this.max();
    return m > 0 ? Math.min(100, Math.round((this.value() / m) * 100)) : 0;
  });

  readonly tone = computed(() => {
    if (this.late()) return 'late';
    const p = this.pct();
    return p >= 100 ? 'ok' : p >= 50 ? '' : 'warn';
  });

  readonly color = computed(() => {
    const t = this.tone();
    return t === 'ok' ? 'var(--success)' : t === 'late' ? 'var(--danger)' : t === 'warn' ? 'var(--warning)' : 'var(--primary-500)';
  });
}
