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
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, StatusBadgeComponent, ProgressComponent,
    EmptyComponent, LoadingComponent, DateInputComponent,
    BarChartComponent, RankChartComponent, TPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'nav_analytics' | t }}</div>
          <div class="sub">{{ day }}</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(-1)" [attr.data-tip]="'rep_prev_day' | t"><ui-icon name="chevron-left" [size]="16" /></button>
          <ui-date-input style="width:158px" size="sm" [(ngModel)]="day" (ngModelChange)="load()" />
          <button class="btn btn-icon btn-sm" type="button" (click)="shiftDay(1)" [attr.data-tip]="'rep_next_day' | t"><ui-icon name="chevron-right" [size]="16" /></button>
          <button class="btn btn-sm" type="button" (click)="today()">{{ 'today' | t }}</button>
        </div>
      </div>

      @if (loading()) { <ui-loading [count]="4" [height]="90" /> }
      @else if (report(); as r) {
        <div class="stats mb-6">
          <div class="stat">
            <div class="k">{{ 'produced' | t }}</div><div class="v">{{ r.totals.qty | num }}</div>
            <div class="m">{{ 'pieces' | t }}</div>
            <span class="ic"><ui-icon name="shirt" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'defect_label' | t }}</div>
            <div class="v" [style.color]="r.totals.defect ? 'var(--danger)' : ''">{{ r.totals.defect | num }}</div>
            <div class="m">{{ defectRate(r) }}%</div>
            <span class="ic"><ui-icon name="alert-circle" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'an_active_depts' | t }}</div><div class="v">{{ r.byStage.length | num }}</div>
            <div class="m">{{ i18n.t('rep_ops_count', { n: r.totals.operations }) }}</div>
            <span class="ic"><ui-icon name="building" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'rep_orders' | t }}</div><div class="v">{{ r.totals.orders | num }}</div>
            <div class="m">{{ 'an_in_work' | t }}</div>
            <span class="ic"><ui-icon name="clipboard-list" [size]="30" /></span>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-head">
            <h3>{{ 'an_by_department' | t }}</h3>
            @if (activeStage()) {
              <button class="btn btn-sm" type="button" (click)="activeStage.set(null)">
                <ui-icon name="x" [size]="14" /> {{ 'an_show_all' | t }}
              </button>
            } @else {
              <span class="tiny text-3">{{ 'an_pick_dept_hint' | t }}</span>
            }
          </div>
          <div class="card-body">
            @if (r.byStage.length) {
              <ui-bar-chart [points]="deptPoints()" [height]="200" [active]="activeStage()" (pick)="toggleStage($event)" />
            } @else { <ui-empty icon="history" [title]="'rep_no_ops_day' | t" /> }
          </div>
        </div>

        <div class="grid two mb-6">
          <div class="card">
            <div class="card-head"><h3>{{ 'by_model' | t }}</h3></div>
            <div class="card-body">
              @if (modelPoints().length) { <ui-rank-chart [points]="modelPoints()" /> }
              @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>{{ 'an_trend' | t }}</h3>
              <span class="tiny text-3">{{ 'rep_pick_day_hint' | t }}</span>
            </div>
            <div class="card-body">
              @if (trend().length) { <ui-bar-chart [points]="trendPoints()" [height]="200" [active]="day" (pick)="pickDay($event)" /> }
              @else { <ui-empty icon="chart-column" [title]="'no_data' | t" /> }
            </div>
          </div>
        </div>

        @if (visibleStages().length) {
          <div class="dept-grid">
            @for (s of visibleStages(); track s.stage) {
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
        }
      }
    </div>
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); }

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
