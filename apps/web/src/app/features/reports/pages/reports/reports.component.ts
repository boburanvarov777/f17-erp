import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { seesFinancials } from '../../../../core/utils/role.util';
import { NumPipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { PALETTE, STAGE_COLOR, STATUS_COLOR } from '../../../../shared/ui/chart-colors';
import { BarChartComponent } from '../../../../shared/ui/bar-chart/bar-chart.component';
import { RankChartComponent } from '../../../../shared/ui/rank-chart/rank-chart.component';
import { DonutChartComponent } from '../../../../shared/ui/donut-chart/donut-chart.component';
import { ChartPoint } from '../../../../shared/ui/chart.types';
import { DateInputComponent } from '../../../../shared/ui/date-input.component';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';

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
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  standalone: true,
  imports: [
    FormsModule, IconComponent, EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, DonutChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private auth = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly showFinancials = computed(() => seesFinancials(this.auth.user()));

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
}
