import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { BarChartComponent, ChartPoint, DonutChartComponent, RankChartComponent } from '../../shared/ui/chart.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

interface Series { qty: number; defect: number; operations: number }

interface ProductionReport {
  totals: Series;
  byStage: (Series & { stage: string })[];
  byUser: (Series & { user: string })[];
  byModel: (Series & { model: string })[];
  daily: (Series & { date: string })[];
}

interface DailyOrderRow {
  orderId: string; number: string;
  model: string | null; modelName: string | null; client: string | null;
  orderStatus: string; stageStatus: string;
  planQty: number; doneQty: number;
  qty: number; defect: number; operations: number;
  users: string[];
}

interface DailyReport {
  date: string;
  totals: Series & { orders: number };
  byStage: (Series & { stage: string; orders: DailyOrderRow[] })[];
}

const STAGE_COLOR: Record<string, string> = {
  CUTTING: 'var(--stage-cutting)', SEWING: 'var(--stage-sewing)', WASHING: 'var(--stage-washing)',
  LASER: 'var(--stage-laser)', PACKING: 'var(--stage-packing)', LOADING: 'var(--stage-loading)',
};

const STATUS_COLOR: Record<string, string> = {
  NEW: 'var(--primary-500)', CONFIRMED: 'var(--info)', IN_PRODUCTION: 'var(--warning)',
  READY: 'var(--success)', LOADING: 'var(--stage-loading)', COMPLETED: 'var(--stage-sewing)',
  CANCELLED: 'var(--text-3)', DELAYED: 'var(--danger)',
  OK: 'var(--success)', LOW: 'var(--warning)', OUT: 'var(--danger)',
};

const PALETTE = [
  'var(--stage-cutting)', 'var(--stage-sewing)', 'var(--stage-washing)',
  'var(--stage-laser)', 'var(--stage-packing)', 'var(--stage-loading)',
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, StatusBadgeComponent, ProgressComponent,
    EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, DonutChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'reports_title' | t }}</div>
          <div class="sub">{{ from }} — {{ to }}</div>
        </div>
        <div class="page-actions">
          <div class="presets no-print">
            @for (p of presets; track p.days) {
              <button type="button" [class.active]="activePreset() === p.days" (click)="applyPreset(p.days)">{{ p.label | t }}</button>
            }
          </div>
          <ui-date-input style="width:148px" size="sm" [(ngModel)]="from" (ngModelChange)="onRangeChange()" />
          <ui-date-input style="width:148px" size="sm" [(ngModel)]="to" (ngModelChange)="onRangeChange()" />
          <button class="btn btn-sm" type="button" (click)="print()" [attr.data-tip]="'print' | t"><ui-icon name="printer" [size]="15" /> {{ 'print' | t }}</button>
        </div>
      </div>

      <div class="tabs mb-4 no-print">
        @for (t of tabs; track t.key) {
          <button type="button" [class.active]="tab() === t.key" (click)="switchTab(t.key)">{{ t.label | t }}</button>
        }
      </div>

      @if (loading()) { <ui-loading [count]="4" [height]="90" /> }
      @else {
        @switch (tab()) {

          @case ('production') {
            @if (production(); as p) {
              <div class="stats mb-6">
                <div class="stat">
                  <div class="k">{{ 'produced' | t }}</div><div class="v">{{ p.totals.qty | num }}</div>
                  <div class="m">{{ 'pieces' | t }}</div>
                  <span class="ic"><ui-icon name="shirt" [size]="30" /></span>
                </div>
                <div class="stat">
                  <div class="k">{{ 'defect_label' | t }}</div>
                  <div class="v" [style.color]="p.totals.defect ? 'var(--danger)' : ''">{{ p.totals.defect | num }}</div>
                  <div class="m">{{ defectRate(p.totals) }}%</div>
                  <span class="ic"><ui-icon name="alert-circle" [size]="30" /></span>
                </div>
                <div class="stat">
                  <div class="k">{{ 'operations' | t }}</div><div class="v">{{ p.totals.operations | num }}</div>
                  <div class="m">{{ 'report_records' | t }}</div>
                  <span class="ic"><ui-icon name="history" [size]="30" /></span>
                </div>
                <div class="stat">
                  <div class="k">{{ 'rep_avg_per_day' | t }}</div><div class="v">{{ avgPerDay() | num }}</div>
                  <div class="m">{{ i18n.t('rep_days_count', { n: p.daily.length }) }}</div>
                  <span class="ic"><ui-icon name="chart-column" [size]="30" /></span>
                </div>
              </div>

              <div class="card mb-6">
                <div class="card-head">
                  <h3>{{ 'rep_trend' | t }}</h3>
                  <span class="tiny text-3 no-print">{{ 'rep_pick_day_hint' | t }}</span>
                </div>
                <div class="card-body">
                  @if (p.totals.operations) {
                    <ui-bar-chart [points]="trendPoints()" [height]="220" [active]="day" (pick)="openDay($event)" />
                    <div class="legend mt-4">
                      <span><i style="background:var(--primary-500)"></i>{{ 'produced' | t }}</span>
                      <span><i style="background:var(--danger)"></i>{{ 'defect_label' | t }}</span>
                    </div>
                  } @else { <ui-empty icon="chart-column" [title]="'no_data' | t" /> }
                </div>
              </div>

              <div class="grid two mb-6">
                <div class="card">
                  <div class="card-head"><h3>{{ 'by_stage' | t }}</h3></div>
                  <div class="card-body">
                    @if (p.byStage.length) { <ui-rank-chart [points]="stagePoints()" /> }
                    @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                  </div>
                </div>
                <div class="card">
                  <div class="card-head"><h3>{{ 'by_model' | t }}</h3></div>
                  <div class="card-body">
                    @if (p.byModel.length) { <ui-rank-chart [points]="modelPoints()" /> }
                    @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-head"><h3>{{ 'by_employee' | t }}</h3></div>
                <div class="card-body">
                  @if (p.byUser.length) { <ui-rank-chart [points]="userPoints()" /> }
                  @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                </div>
              </div>
            }
          }

          @case ('daily') {
            <div class="card mb-6">
              <div class="day-bar">
                <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(-1)" [attr.data-tip]="'rep_prev_day' | t"><ui-icon name="chevron-left" [size]="16" /></button>
                <ui-date-input style="width:170px" [(ngModel)]="day" (ngModelChange)="loadDaily()" />
                <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(1)" [attr.data-tip]="'rep_next_day' | t"><ui-icon name="chevron-right" [size]="16" /></button>
                <button class="btn btn-sm" type="button" (click)="today()">{{ 'today' | t }}</button>
                <div class="grow"></div>
                @if (daily(); as d) {
                  <div class="day-totals">
                    <span><b>{{ d.totals.qty | num }}</b> {{ 'produced' | t }}</span>
                    <span [class.danger]="d.totals.defect"><b>{{ d.totals.defect | num }}</b> {{ 'defect_label' | t }}</span>
                    <span><b>{{ d.totals.operations | num }}</b> {{ 'operations' | t }}</span>
                    <span><b>{{ d.totals.orders | num }}</b> {{ 'rep_orders' | t }}</span>
                  </div>
                }
              </div>
            </div>

            @if (daily(); as d) {
              @if (d.byStage.length) {
                <div class="dept-grid">
                  @for (s of d.byStage; track s.stage) {
                    <div class="card dept">
                      <div class="card-head">
                        <ui-status [value]="s.stage" prefix="stage_" />
                        <span class="dept-sum">
                          <b>{{ s.qty | num }}</b> {{ 'pieces' | t }}
                          @if (s.defect) { <em>· {{ 'defect_label' | t }} {{ s.defect | num }}</em> }
                          <span class="text-3">· {{ i18n.t('rep_ops_count', { n: s.operations }) }}</span>
                        </span>
                      </div>
                      <div class="ord-list">
                        @for (o of s.orders; track o.orderId) {
                          <a class="ord" [routerLink]="['/orders', o.orderId]">
                            <span class="ord-main">
                              <span class="ord-top">
                                <b class="mono">{{ o.number }}</b>
                                @if (o.model) { <span class="badge badge-neutral">{{ o.model }}</span> }
                                <ui-status [value]="o.stageStatus" />
                              </span>
                              <span class="ord-sub">{{ o.modelName || o.client || '—' }}@if (o.users.length) { · {{ o.users.join(', ') }} }</span>
                            </span>
                            <span class="ord-qty">
                              <b>+{{ o.qty | num }}</b>
                              @if (o.defect) { <em>{{ 'defect_label' | t }} {{ o.defect | num }}</em> }
                            </span>
                            <span class="ord-prog">
                              <ui-progress [value]="o.doneQty" [max]="o.planQty" [showLabel]="false" />
                              <span class="tiny text-3">{{ o.doneQty | num }} / {{ o.planQty | num }}</span>
                            </span>
                          </a>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="card"><ui-empty icon="history" [title]="'rep_no_ops_day' | t" /></div>
              }
            }
          }

          @case ('orders') {
            <div class="grid two">
              <div class="card">
                <div class="card-head"><h3>{{ 'rep_by_status' | t }}</h3></div>
                <div class="card-body">
                  @if (orders().length) { <ui-donut-chart [points]="orderStatusPoints()" [caption]="'rep_orders' | t" /> }
                  @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                </div>
              </div>
              <div class="card">
                <div class="card-head"><h3>{{ 'quantity' | t }}</h3></div>
                <div class="card-body">
                  @if (orders().length) { <ui-rank-chart [points]="orderQtyPoints()" /> }
                  @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                </div>
              </div>
            </div>
          }

          @case ('defects') {
            @if (defects().length) {
              <div class="grid two">
                <div class="card">
                  <div class="card-head"><h3>{{ 'by_stage' | t }}</h3></div>
                  <div class="card-body"><ui-rank-chart [points]="defectStagePoints()" /></div>
                </div>
                <div class="card">
                  <div class="card-head"><h3>{{ 'rep_defect_types' | t }}</h3></div>
                  <div class="card-body"><ui-donut-chart [points]="defectTypePoints()" [caption]="'pieces' | t" /></div>
                </div>
              </div>
            } @else {
              <div class="card"><ui-empty icon="check-circle" [title]="'no_defects_short' | t" /></div>
            }
          }

          @case ('warehouse') {
            @if (warehouse().length) {
              <div class="grid two mb-6">
                <div class="card">
                  <div class="card-head"><h3>{{ 'rep_stock_status' | t }}</h3></div>
                  <div class="card-body"><ui-donut-chart [points]="stockStatusPoints()" [caption]="'material' | t" /></div>
                </div>
                <div class="card">
                  <div class="card-head"><h3>{{ 'rep_top_value' | t }}</h3></div>
                  <div class="card-body"><ui-rank-chart [points]="stockValuePoints()" /></div>
                </div>
              </div>
              <div class="card">
                <div class="card-head"><h3>{{ 'rep_low_stock' | t }}</h3></div>
                <div class="card-body">
                  @if (lowStockPoints().length) { <ui-rank-chart [points]="lowStockPoints()" /> }
                  @else { <ui-empty icon="check-circle" [title]="'no_data' | t" /> }
                </div>
                <div class="card-foot row-between">
                  <b class="small">{{ 'report_value' | t }}</b>
                  <b>{{ warehouseValue() | num }} {{ 'currency_uzs' | t }}</b>
                </div>
              </div>
            } @else {
              <div class="card"><ui-empty icon="boxes" [title]="'no_data' | t" /></div>
            }
          }
        }
      }
    </div>
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); }

    .presets { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--r); overflow: hidden; }
    .presets button {
      height: 32px; padding: 0 11px; border: none; border-right: 1px solid var(--border);
      background: var(--surface); color: var(--text-2); font-size: 12.5px; cursor: pointer;
    }
    .presets button:last-child { border-right: none; }
    .presets button:hover { background: var(--surface-3); color: var(--text); }
    .presets button.active { background: var(--primary); color: #fff; font-weight: 600; }

    .legend { display: flex; gap: 16px; font-size: 11.5px; color: var(--text-3); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 9px; height: 9px; border-radius: 3px; }

    .day-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; flex-wrap: wrap; }
    .day-totals { display: flex; gap: 16px; font-size: 12.5px; color: var(--text-3); flex-wrap: wrap; }
    .day-totals b { color: var(--text); font-size: 14px; font-variant-numeric: tabular-nums; }
    .day-totals .danger b { color: var(--danger); }

    .dept-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 16px; }
    .dept .card-head { gap: 10px; flex-wrap: wrap; }
    .dept-sum { font-size: 12px; color: var(--text-3); }
    .dept-sum b { color: var(--text); font-size: 13px; }
    .dept-sum em { color: var(--danger); font-style: normal; font-weight: 600; }

    .ord-list { display: flex; flex-direction: column; }
    .ord {
      display: grid; grid-template-columns: 1fr auto 118px; align-items: center; gap: 14px;
      padding: 11px 18px; border-bottom: 1px solid var(--border);
      text-decoration: none; color: inherit;
    }
    .ord:last-child { border-bottom: none; }
    .ord:hover { background: var(--surface-2); text-decoration: none; }
    .ord-main { min-width: 0; }
    .ord-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .ord-sub { display: block; font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ord-qty { text-align: right; white-space: nowrap; }
    .ord-qty b { font-size: 14px; font-variant-numeric: tabular-nums; }
    .ord-qty em { display: block; font-size: 11px; color: var(--danger); font-style: normal; }
    .ord-prog { display: flex; flex-direction: column; gap: 3px; }

    @media (max-width: 620px) {
      .ord { grid-template-columns: 1fr auto; }
      .ord-prog { grid-column: 1 / -1; }
    }
  `],
})
export class ReportsComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);

  readonly tabs = [
    { key: 'production', label: 'rep_production' },
    { key: 'daily', label: 'rep_daily' },
    { key: 'orders', label: 'rep_orders' },
    { key: 'defects', label: 'rep_defects' },
    { key: 'warehouse', label: 'rep_warehouse' },
  ];

  readonly presets = [
    { days: 0, label: 'today' },
    { days: 7, label: 'rep_last_7' },
    { days: 30, label: 'rep_last_30' },
    { days: 90, label: 'rep_last_90' },
  ];

  readonly tab = signal('production');
  readonly loading = signal(false);
  readonly production = signal<ProductionReport | null>(null);
  readonly daily = signal<DailyReport | null>(null);
  readonly orders = signal<{ status: string; orders: number; qty: number }[]>([]);
  readonly defects = signal<{ stage: string; type: string; qty: number; count: number }[]>([]);
  readonly warehouse = signal<any[]>([]);
  readonly activePreset = signal<number | null>(30);

  from = '';
  to = '';
  day = '';

  readonly warehouseValue = computed(() => this.warehouse().reduce((a, r) => a + (r.value ?? 0), 0));

  readonly avgPerDay = computed(() => {
    const p = this.production();
    if (!p) return 0;
    const active = p.daily.filter((d) => d.operations > 0).length;
    return active ? Math.round(p.totals.qty / active) : 0;
  });

  readonly trendPoints = computed<ChartPoint[]>(() =>
    (this.production()?.daily ?? []).map((d) => ({
      key: d.date,
      label: d.date.slice(8),
      value: d.qty,
      extra: d.defect,
      hint: `${d.date} · ${this.i18n.t('produced')}: ${d.qty} · ${this.i18n.t('defect_label')}: ${d.defect}`,
    })),
  );

  readonly stagePoints = computed<ChartPoint[]>(() =>
    (this.production()?.byStage ?? []).map((s) => ({
      key: s.stage,
      label: this.i18n.t(`stage_${s.stage}`),
      value: s.qty,
      extra: s.defect,
      color: STAGE_COLOR[s.stage],
      hint: this.i18n.t('rep_ops_count', { n: s.operations }),
    })),
  );

  readonly modelPoints = computed<ChartPoint[]>(() =>
    (this.production()?.byModel ?? []).map((m, i) => ({
      key: m.model,
      label: m.model,
      value: m.qty,
      extra: m.defect,
      color: PALETTE[i % PALETTE.length],
      hint: this.i18n.t('rep_ops_count', { n: m.operations }),
    })),
  );

  readonly userPoints = computed<ChartPoint[]>(() =>
    (this.production()?.byUser ?? []).map((u) => ({
      key: u.user,
      label: u.user,
      value: u.qty,
      extra: u.defect,
      hint: this.i18n.t('rep_ops_count', { n: u.operations }),
    })),
  );

  readonly orderStatusPoints = computed<ChartPoint[]>(() =>
    this.orders().map((o, i) => ({
      key: o.status,
      label: this.i18n.t(`st_${o.status}`),
      value: o.orders,
      color: STATUS_COLOR[o.status] ?? PALETTE[i % PALETTE.length],
    })),
  );

  readonly orderQtyPoints = computed<ChartPoint[]>(() =>
    [...this.orders()].sort((a, b) => b.qty - a.qty).map((o, i) => ({
      key: o.status,
      label: this.i18n.t(`st_${o.status}`),
      value: o.qty,
      color: STATUS_COLOR[o.status] ?? PALETTE[i % PALETTE.length],
    })),
  );

  readonly defectStagePoints = computed<ChartPoint[]>(() => {
    const byStage = new Map<string, number>();
    for (const d of this.defects()) byStage.set(d.stage, (byStage.get(d.stage) ?? 0) + d.qty);
    return [...byStage.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([stage, qty]) => ({
        key: stage,
        label: this.i18n.t(`stage_${stage}`),
        value: qty,
        color: STAGE_COLOR[stage],
      }));
  });

  readonly defectTypePoints = computed<ChartPoint[]>(() => {
    const byType = new Map<string, number>();
    for (const d of this.defects()) byType.set(d.type, (byType.get(d.type) ?? 0) + d.qty);
    return [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, qty], i) => ({ key: type, label: type, value: qty, color: PALETTE[i % PALETTE.length] }));
  });

  readonly stockStatusPoints = computed<ChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const m of this.warehouse()) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
    return ['OK', 'LOW', 'OUT']
      .filter((s) => counts.has(s))
      .map((s) => ({ key: s, label: this.i18n.t(`st_${s}`), value: counts.get(s)!, color: STATUS_COLOR[s] }));
  });

  readonly stockValuePoints = computed<ChartPoint[]>(() =>
    this.warehouse()
      .filter((m) => m.value)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)
      .map((m, i) => ({
        key: m.code,
        label: `${m.code} · ${m.name}`,
        value: Math.round(m.value),
        color: PALETTE[i % PALETTE.length],
      })),
  );

  readonly lowStockPoints = computed<ChartPoint[]>(() =>
    this.warehouse()
      .filter((m) => m.status !== 'OK')
      .sort((a, b) => a.available - b.available)
      .slice(0, 12)
      .map((m) => ({
        key: m.code,
        label: `${m.code} · ${m.name}`,
        value: Math.max(0, Math.round(m.available)),
        color: STATUS_COLOR[m.status],
        hint: `${this.i18n.t('min_stock')}: ${m.minStock} ${m.unit}`,
      })),
  );

  constructor() {
    this.day = iso(new Date());
    this.applyPreset(30);
  }

  switchTab(key: string): void {
    this.tab.set(key);
    this.load();
  }

  applyPreset(days: number): void {
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(start.getDate() - days + 1);
    this.from = iso(start);
    this.to = iso(end);
    this.activePreset.set(days);
    this.load();
  }

  onRangeChange(): void {
    this.activePreset.set(null);
    this.load();
  }

  /** Jumping from a trend bar into that day's departmental breakdown. */
  openDay(date: string): void {
    this.day = date;
    this.tab.set('daily');
    this.loadDaily();
  }

  shiftDay(delta: number): void {
    const d = new Date(this.day || iso(new Date()));
    d.setDate(d.getDate() + delta);
    this.day = iso(d);
    this.loadDaily();
  }

  today(): void {
    this.day = iso(new Date());
    this.loadDaily();
  }

  defectRate(t: Series): number {
    const base = t.qty + t.defect;
    return base > 0 ? +((t.defect / base) * 100).toFixed(1) : 0;
  }

  load(): void {
    this.loading.set(true);
    const params = { from: this.from, to: this.to };
    const done = () => this.loading.set(false);

    switch (this.tab()) {
      case 'production':
        this.api.get<ProductionReport>('/reports/production', params).subscribe({ next: (r) => { this.production.set(r); done(); }, error: done });
        break;
      case 'daily':
        this.loadDaily();
        break;
      case 'orders':
        this.api.get<any[]>('/reports/orders', params).subscribe({ next: (r) => { this.orders.set(r); done(); }, error: done });
        break;
      case 'defects':
        this.api.get<any[]>('/reports/defects', params).subscribe({ next: (r) => { this.defects.set(r); done(); }, error: done });
        break;
      case 'warehouse':
        this.api.get<any[]>('/reports/warehouse').subscribe({ next: (r) => { this.warehouse.set(r); done(); }, error: done });
        break;
    }
  }

  loadDaily(): void {
    this.loading.set(true);
    this.api.get<DailyReport>('/reports/daily', { date: this.day }).subscribe({
      next: (r) => { this.daily.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  print(): void { window.print(); }
}
