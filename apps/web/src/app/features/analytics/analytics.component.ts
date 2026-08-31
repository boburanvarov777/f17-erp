import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { PALETTE, STAGE_COLOR } from '../../shared/ui/chart-colors';
import { BarChartComponent, ChartPoint, RankChartComponent } from '../../shared/ui/chart.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

interface DayOrderRow {
  orderId: string; number: string;
  model: string | null; modelName: string | null; client: string | null;
  orderStatus: string; stageStatus: string;
  planQty: number; doneQty: number;
  qty: number; defect: number; operations: number;
  users: string[];
}

interface DayStage {
  stage: string;
  qty: number; defect: number; operations: number;
  orders: DayOrderRow[];
}

interface DayReport {
  date: string;
  totals: { qty: number; defect: number; operations: number; orders: number };
  byStage: DayStage[];
}

interface TrendDay { date: string; qty: number; defect: number; operations: number }

const TREND_DAYS = 14;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Which department produced how much, of which model, on a given day. */
@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, StatusBadgeComponent, ProgressComponent,
    EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly i18n = inject(I18nService);

  readonly loading = signal(false);
  readonly report = signal<DayReport | null>(null);
  readonly trend = signal<TrendDay[]>([]);
  readonly activeStage = signal<string | null>(null);

  day = iso(new Date());

  readonly visibleStages = computed(() => {
    const stages = this.report()?.byStage ?? [];
    const active = this.activeStage();
    return active ? stages.filter((s) => s.stage === active) : stages;
  });

  readonly deptPoints = computed<ChartPoint[]>(() =>
    (this.report()?.byStage ?? []).map((s) => ({
      key: s.stage,
      label: this.i18n.t(`stage_${s.stage}`),
      value: s.qty,
      extra: s.defect,
      color: STAGE_COLOR[s.stage],
      hint: `${this.i18n.t(`stage_${s.stage}`)} · ${s.qty} ${this.i18n.t('pieces')} · ${this.i18n.t('rep_ops_count', { n: s.operations })}`,
    })),
  );

  readonly modelPoints = computed<ChartPoint[]>(() => {
    const byModel = new Map<string, { qty: number; defect: number; operations: number }>();
    for (const s of this.visibleStages()) {
      for (const o of s.orders) {
        const key = o.model ?? '—';
        const acc = byModel.get(key) ?? { qty: 0, defect: 0, operations: 0 };
        acc.qty += o.qty; acc.defect += o.defect; acc.operations += o.operations;
        byModel.set(key, acc);
      }
    }
    return [...byModel.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([model, v], i) => ({
        key: model,
        label: model,
        value: v.qty,
        extra: v.defect,
        color: PALETTE[i % PALETTE.length],
        hint: this.i18n.t('rep_ops_count', { n: v.operations }),
      }));
  });

  readonly trendPoints = computed<ChartPoint[]>(() =>
    this.trend().map((d) => ({
      key: d.date,
      label: d.date.slice(8),
      value: d.qty,
      extra: d.defect,
      hint: `${d.date} · ${this.i18n.t('produced')}: ${d.qty} · ${this.i18n.t('defect_label')}: ${d.defect}`,
    })),
  );

  constructor() {
    const date = this.route.snapshot.queryParamMap.get('date');
    if (date) this.day = date;
    this.load();
  }

  defectRate(r: DayReport): number {
    const base = r.totals.qty + r.totals.defect;
    return base > 0 ? +((r.totals.defect / base) * 100).toFixed(1) : 0;
  }

  toggleStage(stage: string): void {
    this.activeStage.set(this.activeStage() === stage ? null : stage);
  }

  pickDay(date: string): void {
    this.day = date;
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
    this.activeStage.set(null);
    // Keeps the day shareable and lets the reports trend link straight here.
    this.router.navigate([], { relativeTo: this.route, queryParams: { date: this.day }, replaceUrl: true });

    const to = new Date(this.day);
    const from = new Date(this.day);
    from.setDate(from.getDate() - TREND_DAYS + 1);

    this.api.get<DayReport>('/reports/daily', { date: this.day }).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.get<{ daily: TrendDay[] }>('/reports/production', { from: iso(from), to: iso(to) }).subscribe({
      next: (r) => this.trend.set(r.daily ?? []),
      error: () => this.trend.set([]),
    });
  }
}
