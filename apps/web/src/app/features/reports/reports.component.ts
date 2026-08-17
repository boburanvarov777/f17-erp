import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { PALETTE, STAGE_COLOR, STATUS_COLOR } from '../../shared/ui/chart-colors';
import { BarChartComponent, ChartPoint, DonutChartComponent, RankChartComponent } from '../../shared/ui/chart.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';

interface Series { qty: number; defect: number; operations: number }

interface ProductionReport {
  totals: Series;
  byStage: (Series & { stage: string })[];
  byUser: (Series & { user: string })[];
  byModel: (Series & { model: string })[];
  daily: (Series & { date: string })[];
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    FormsModule, IconComponent, EmptyComponent, LoadingComponent, DateInputComponent,
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
                    <ui-bar-chart [points]="trendPoints()" [height]="220" (pick)="openDay($event)" />
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
  `],
})
export class ReportsComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly i18n = inject(I18nService);

  readonly tabs = [
    { key: 'production', label: 'rep_production' },
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
  readonly orders = signal<{ status: string; orders: number; qty: number }[]>([]);
  readonly defects = signal<{ stage: string; type: string; qty: number; count: number }[]>([]);
  readonly warehouse = signal<any[]>([]);
  readonly activePreset = signal<number | null>(30);

  from = '';
  to = '';

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
    this.router.navigate(['/analytics'], { queryParams: { date } });
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

  print(): void { window.print(); }
}
