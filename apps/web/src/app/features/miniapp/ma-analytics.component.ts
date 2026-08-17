import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { PALETTE } from '../../shared/ui/chart-colors';
import { BarChartComponent, ChartPoint, RankChartComponent } from '../../shared/ui/chart.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

interface DeptOrderRow {
  orderId: string; number: string;
  model: string | null; modelName: string | null; client: string | null;
  stageStatus: string; planQty: number; doneQty: number;
  qty: number; defect: number; operations: number;
  users: string[];
}

interface DeptDay {
  date: string;
  stage: string | null;
  totals: { qty: number; defect: number; operations: number; orders: number };
  orders: DeptOrderRow[];
  byModel: { model: string; qty: number; defect: number; operations: number }[];
  trend: { date: string; qty: number; defect: number; operations: number }[];
}

const TREND_DAYS = 7;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What the worker's own department produced on a day, per order and model. */
@Component({
  selector: 'app-ma-analytics',
  standalone: true,
  imports: [
    FormsModule, IconComponent, StatusBadgeComponent, ProgressComponent,
    EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-between mb-3">
      <div>
        <div style="font-size:16px;font-weight:600">{{ 'nav_analytics' | t }}</div>
        <div class="tiny text-3">{{ ma.user()?.department?.name || ('an_my_department' | t) }}</div>
      </div>
      @if (data(); as d) { @if (d.stage) { <ui-status [value]="d.stage" prefix="stage_" /> } }
    </div>

    <div class="day-row mb-3">
      <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(-1)"><ui-icon name="chevron-left" [size]="16" /></button>
      <ui-date-input size="sm" [(ngModel)]="day" (ngModelChange)="load()" />
      <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(1)" [disabled]="isToday()"><ui-icon name="chevron-right" [size]="16" /></button>
      <button class="btn btn-sm" type="button" (click)="today()" [disabled]="isToday()">{{ 'today' | t }}</button>
    </div>

    @if (loading()) { <ui-loading [count]="3" [height]="80" /> }
    @else if (data(); as d) {
      @if (!d.stage) {
        <div class="card"><ui-empty icon="info" [title]="'an_no_stage' | t" /></div>
      } @else {
        <div class="totals card card-pad mb-3">
          <div class="t-main">
            <div class="t-val">{{ d.totals.qty | num }}</div>
            <div class="tiny text-3">{{ 'produced' | t }} · {{ 'pieces' | t }}</div>
          </div>
          <div class="t-side">
            <div class="t-item">
              <span class="tiny text-3">{{ 'defect_label' | t }}</span>
              <b [style.color]="d.totals.defect ? 'var(--danger)' : ''">{{ d.totals.defect | num }}</b>
            </div>
            <div class="t-item">
              <span class="tiny text-3">{{ 'rep_orders' | t }}</span>
              <b>{{ d.totals.orders | num }}</b>
            </div>
            <div class="t-item">
              <span class="tiny text-3">{{ 'operations' | t }}</span>
              <b>{{ d.totals.operations | num }}</b>
            </div>
          </div>
        </div>

        <div class="card card-pad mb-3">
          <div class="row-between mb-2">
            <b class="small">{{ 'an_last_7' | t }}</b>
            <span class="tiny text-3">{{ 'rep_pick_day_hint' | t }}</span>
          </div>
          <ui-bar-chart [points]="trendPoints()" [height]="150" [active]="day" (pick)="pickDay($event)" />
        </div>

        @if (d.byModel.length) {
          <div class="card card-pad mb-3">
            <b class="small">{{ 'by_model' | t }}</b>
            <div class="mt-3"><ui-rank-chart [points]="modelPoints()" /></div>
          </div>
        }

        @if (d.orders.length) {
          <div class="col gap-2">
            @for (o of d.orders; track o.orderId) {
              <div class="card card-pad ord">
                <div class="row-between">
                  <span class="row gap-2" style="flex-wrap:wrap">
                    <b class="mono small">{{ o.number }}</b>
                    @if (o.model) { <span class="badge badge-neutral tiny-badge">{{ o.model }}</span> }
                  </span>
                  <b class="qty">+{{ o.qty | num }}</b>
                </div>
                <div class="tiny text-3 mt-1">{{ o.modelName || o.client || '—' }}</div>
                <div class="mt-2"><ui-progress [value]="o.doneQty" [max]="o.planQty" [showLabel]="false" /></div>
                <div class="row-between tiny text-3 mt-1">
                  <span>{{ o.doneQty | num }} / {{ o.planQty | num }}</span>
                  <span class="row gap-2">
                    @if (o.defect) { <em class="defect">{{ 'defect_label' | t }} {{ o.defect | num }}</em> }
                    <ui-status [value]="o.stageStatus" />
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="card"><ui-empty icon="history" [title]="'rep_no_ops_day' | t" /></div>
        }
      }
    }
  `,
  styles: [`
    .day-row { display: flex; align-items: center; gap: 6px; }
    .day-row ui-date-input { flex: 1; min-width: 0; }

    .totals { display: flex; align-items: center; gap: 14px; }
    .t-main { flex: 1; min-width: 0; }
    .t-val { font-size: 27px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .t-side { display: flex; gap: 14px; }
    .t-item { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .t-item b { font-size: 14px; font-variant-numeric: tabular-nums; }

    .tiny-badge { font-size: 10px; padding: 2px 7px; }
    .ord .qty { font-size: 15px; font-variant-numeric: tabular-nums; }
    .defect { color: var(--danger); font-style: normal; font-weight: 600; }
  `],
})
export class MaAnalyticsComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly loading = signal(true);
  readonly data = signal<DeptDay | null>(null);

  day = iso(new Date());

  readonly trendPoints = computed<ChartPoint[]>(() =>
    (this.data()?.trend ?? []).map((d) => ({
      key: d.date,
      label: d.date.slice(8),
      value: d.qty,
      extra: d.defect,
      hint: `${d.date} · ${d.qty}`,
    })),
  );

  readonly modelPoints = computed<ChartPoint[]>(() =>
    (this.data()?.byModel ?? []).map((m, i) => ({
      key: m.model,
      label: m.model,
      value: m.qty,
      extra: m.defect,
      color: PALETTE[i % PALETTE.length],
      hint: this.i18n.t('rep_ops_count', { n: m.operations }),
    })),
  );

  constructor() {
    this.load();
    // Entering a new operation should show up in the day's numbers right away.
    effect(() => {
      if (this.ma.productionTick() > 0) this.load();
    });
  }

  isToday(): boolean { return this.day === iso(new Date()); }

  pickDay(date: string): void {
    this.day = date;
    haptic('success');
    this.load();
  }

  shiftDay(delta: number): void {
    const d = new Date(this.day || iso(new Date()));
    d.setDate(d.getDate() + delta);
    this.day = iso(d);
    this.load();
  }

  today(): void {
    this.day = iso(new Date());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<DeptDay>('/reports/my-department', { date: this.day, days: TREND_DAYS }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
