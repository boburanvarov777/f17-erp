import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NumPipe } from '../../pipes/format.pipe';
import { ChartPoint } from '../chart.types';

const AXIS_TICKS = 4;

/** Vertical bar chart with an optional stacked secondary series. Bars are clickable. */
@Component({
  selector: 'ui-bar-chart',
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
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
    const count = Math.min(AXIS_TICKS, Math.max(1, max));
    return Array.from({ length: count + 1 }, (_, i) => Math.round((max / count) * i));
  });

  pct(v: number): number { return (v / this.max()) * 100; }
}
