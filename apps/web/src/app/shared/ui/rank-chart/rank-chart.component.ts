import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NumPipe } from '../../pipes/format.pipe';
import { ChartPoint } from '../chart.types';

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
