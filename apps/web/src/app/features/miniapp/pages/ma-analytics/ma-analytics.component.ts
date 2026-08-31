import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { NumPipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { PALETTE } from '../../../../shared/ui/chart-colors';
import { BarChartComponent } from '../../../../shared/ui/bar-chart/bar-chart.component';
import { RankChartComponent } from '../../../../shared/ui/rank-chart/rank-chart.component';
import { ChartPoint } from '../../../../shared/ui/chart.types';
import { DateInputComponent } from '../../../../shared/ui/date-input.component';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { MiniAppService } from '../../services/miniapp.service';
import { haptic } from '../../utils/telegram';

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
  templateUrl: './ma-analytics.component.html',
  styleUrl: './ma-analytics.component.scss',
  standalone: true,
  imports: [
    FormsModule, IconComponent, StatusBadgeComponent, ProgressComponent,
    EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
