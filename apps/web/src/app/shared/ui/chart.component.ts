import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NumPipe } from '../pipes/format.pipe';

export interface ChartPoint {
  /** Stable identity, also emitted on click. */
  key: string;
  label: string;
  value: number;
  /** Secondary value stacked on top of `value` — defects in most reports. */
  extra?: number;
  color?: string;
  hint?: string;
}

const AXIS_TICKS = 4;

/** Vertical bar chart with an optional stacked secondary series. Bars are clickable. */
@Component({
  selector: 'ui-bar-chart',
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.scss',
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChartComponent {
  readonly points = input<ChartPoint[]>([]);
  readonly height = input(200);
  readonly active = input<string | null>(null);
  readonly pick = output<string>();

  readonly max = computed(() => {
    const peak = Math.max(0, ...this.points().map((p) => p.value + (p.extra ?? 0)));
    if (peak <= 0) return 1;
    const step = Math.pow(10, Math.floor(Math.log10(peak) || 0));
    return Math.ceil(peak / step) * step;
  });

  readonly ticks = computed(() => {
    const max = this.max();
    // Tiny ranges get fewer gridlines so the axis never repeats the same number.
    const count = Math.min(AXIS_TICKS, Math.max(1, max));
    return Array.from({ length: count + 1 }, (_, i) => Math.round((max / count) * i));
  });

  pct(v: number): number { return (v / this.max()) * 100; }
}

/** Ranked horizontal bars — reads better than a table for stage/employee/model totals. */
@Component({
  selector: 'ui-rank-chart',
  templateUrl: './rank-chart.component.html',
  styleUrl: './rank-chart.component.scss',
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankChartComponent {
  readonly points = input<ChartPoint[]>([]);

  readonly max = computed(() => Math.max(1, ...this.points().map((p) => p.value + (p.extra ?? 0))));

  pct(v: number): number { return (v / this.max()) * 100; }
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Donut for share-of-total breakdowns, with an inline legend. */
@Component({
  selector: 'ui-donut-chart',
  templateUrl: './donut-chart.component.html',
  styleUrl: './donut-chart.component.scss',
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonutChartComponent {
  readonly points = input<ChartPoint[]>([]);
  readonly caption = input('');
  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;

  readonly total = computed(() => this.points().reduce((a, p) => a + p.value, 0));

  readonly segments = computed(() => {
    const total = this.total();
    let offset = 0;
    return this.points().map((p) => {
      const share = total > 0 ? p.value / total : 0;
      const dash = share * CIRCUMFERENCE;
      const seg = {
        ...p,
        color: p.color || 'var(--primary-500)',
        dash,
        offset,
        share: Math.round(share * 100),
      };
      offset += dash;
      return seg;
    });
  });
}
