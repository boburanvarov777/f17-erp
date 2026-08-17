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
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc" [style.height.px]="height()">
      <div class="bc-axis">
        @for (t of ticks(); track $index) {
          <span class="bc-tick"><b>{{ t | num }}</b></span>
        }
      </div>
      <div class="bc-plot">
        @for (t of ticks(); track $index) { <span class="bc-line"></span> }
        <div class="bc-bars">
          @for (p of points(); track p.key) {
            <button
              type="button"
              class="bc-col"
              [class.active]="p.key === active()"
              [class.dim]="active() && p.key !== active()"
              [attr.data-tip]="p.hint || (p.label + ' — ' + p.value)"
              (click)="pick.emit(p.key)"
            >
              <span class="bc-stack">
                @if (p.extra) { <i class="bc-bar defect" [style.height.%]="pct(p.extra)"></i> }
                @if (p.value) { <i class="bc-bar" [style.height.%]="pct(p.value)" [style.background]="p.color || null"></i> }
              </span>
            </button>
          }
        </div>
      </div>
      <div class="bc-labels">
        @for (p of points(); track p.key) {
          <span class="bc-x" [class.active]="p.key === active()">{{ p.label }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    .bc { display: grid; grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; gap: 0 10px; }
    .bc-axis { display: flex; flex-direction: column-reverse; justify-content: space-between; align-items: flex-end; }
    .bc-tick { font-size: 10px; color: var(--text-3); line-height: 1; transform: translateY(-4px); font-variant-numeric: tabular-nums; }
    .bc-plot { position: relative; display: flex; flex-direction: column-reverse; justify-content: space-between; }
    .bc-line { border-top: 1px dashed var(--border); height: 0; }
    .bc-bars { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 4px; }
    .bc-col {
      flex: 1; min-width: 0; height: 100%; padding: 0; border: none; background: none; cursor: pointer;
      display: flex; align-items: flex-end;
    }
    /* Height must be definite here, otherwise the bars' percentage heights collapse. */
    .bc-stack { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
    .bc-bar {
      display: block; flex: 0 0 auto; width: 100%; min-height: 2px;
      background: var(--primary-500); border-radius: 0 0 2px 2px;
      transition: height .3s ease, opacity .15s ease, filter .15s ease;
    }
    .bc-bar.defect { background: var(--danger); border-radius: 3px 3px 0 0; }
    .bc-stack :first-child { border-radius: 3px 3px 0 0; }
    .bc-col:hover .bc-bar { filter: brightness(1.08); }
    .bc-col.dim .bc-bar { opacity: .38; }
    .bc-col.active .bc-bar { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--primary-500); }
    .bc-labels { grid-column: 2; display: flex; gap: 4px; padding-top: 7px; }
    .bc-x {
      flex: 1; min-width: 0; text-align: center; font-size: 10px; color: var(--text-3);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .bc-x.active { color: var(--primary-500); font-weight: 700; }
  `],
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
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rc">
      @for (r of points(); track r.key) {
        <div class="rc-row">
          <div class="rc-head">
            <span class="rc-label" [attr.title]="r.label">{{ r.label }}</span>
            <span class="rc-value">
              {{ r.value | num }}
              @if (r.extra) { <b class="rc-defect">+{{ r.extra | num }}</b> }
            </span>
          </div>
          <div class="rc-track" [attr.data-tip]="r.hint || null">
            <i [style.width.%]="pct(r.value)" [style.background]="r.color || 'var(--primary-500)'"></i>
            @if (r.extra) { <i class="defect" [style.width.%]="pct(r.extra)"></i> }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .rc { display: flex; flex-direction: column; gap: 13px; }
    .rc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
    .rc-label { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rc-value { font-size: 12.5px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .rc-defect { color: var(--danger); font-weight: 600; margin-left: 5px; }
    .rc-track { display: flex; height: 8px; border-radius: 100px; background: var(--surface-3); overflow: hidden; }
    .rc-track i { display: block; height: 100%; min-width: 2px; transition: width .3s ease; }
    .rc-track i.defect { background: var(--danger); }
  `],
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
  standalone: true,
  imports: [NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dc">
      <div class="dc-ring">
        <svg viewBox="0 0 140 140" role="img">
          <circle class="dc-bg" cx="70" cy="70" [attr.r]="radius" />
          @for (s of segments(); track s.key) {
            <circle
              cx="70" cy="70" [attr.r]="radius"
              [attr.stroke]="s.color"
              [attr.stroke-dasharray]="s.dash + ' ' + circumference"
              [attr.stroke-dashoffset]="-s.offset"
            />
          }
        </svg>
        <div class="dc-center">
          <b>{{ total() | num }}</b>
          <span>{{ caption() }}</span>
        </div>
      </div>
      <div class="dc-legend">
        @for (s of segments(); track s.key) {
          <div class="dc-item">
            <i [style.background]="s.color"></i>
            <span class="dc-name">{{ s.label }}</span>
            <b>{{ s.value | num }}</b>
            <span class="dc-pct">{{ s.share }}%</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dc { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .dc-ring { position: relative; width: 150px; height: 150px; flex: 0 0 auto; }
    .dc-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .dc-ring circle { fill: none; stroke-width: 17; transition: stroke-dasharray .35s ease; }
    .dc-ring circle.dc-bg { stroke: var(--surface-3); }
    .dc-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
    .dc-center b { font-size: 23px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .dc-center span { font-size: 10.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; }
    .dc-legend { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 9px; }
    .dc-item { display: grid; grid-template-columns: 9px 1fr auto auto; align-items: center; gap: 9px; font-size: 12.5px; }
    .dc-item i { width: 9px; height: 9px; border-radius: 3px; }
    .dc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dc-item b { font-weight: 600; font-variant-numeric: tabular-nums; }
    .dc-pct { color: var(--text-3); min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
  `],
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
