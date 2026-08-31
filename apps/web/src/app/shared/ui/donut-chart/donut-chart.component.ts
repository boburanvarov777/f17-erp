import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NumPipe } from '../../pipes/format.pipe';
import { ChartPoint } from '../chart.types';

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
