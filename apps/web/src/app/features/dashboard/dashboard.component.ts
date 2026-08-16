import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardData, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { AgoPipe, NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const STAGE_ICON: Record<StageType, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, TPipe, NumPipe, ShortDatePipe, AgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'dash_title' | t }}</div>
          <div class="sub">{{ 'dash_subtitle' | t }} · {{ now | shortDate: true }}</div>
        </div>
        <button class="btn btn-sm" type="button" (click)="load()" [disabled]="loading()">
          <ui-icon name="refresh-cw" [size]="15" /> {{ 'refresh' | t }}
        </button>
      </div>

      @if (loading() && !data()) {
        <ui-loading [count]="4" [height]="86" />
      } @else if (data(); as d) {
        <!-- KPI -->
        <div class="stats mb-6">
          <div class="stat">
            <div class="k">{{ 'kpi_active_orders' | t }}</div>
            <div class="v">{{ d.kpis.activeOrders | num }}</div>
            <div class="m">{{ 'total' | t }}: {{ d.kpis.totalOrders | num }}</div>
            <span class="ic"><ui-icon name="clipboard-list" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'kpi_in_production' | t }}</div>
            <div class="v">{{ d.kpis.inProductionQty | num }}</div>
            <div class="m">{{ 'pieces' | t }}</div>
            <span class="ic"><ui-icon name="shirt" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'kpi_late' | t }}</div>
            <div class="v" [style.color]="d.kpis.lateOrders ? 'var(--danger)' : ''">{{ d.kpis.lateOrders | num }}</div>
            <div class="m">deadline o‘tgan</div>
            <span class="ic"><ui-icon name="alert-triangle" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'kpi_ready' | t }}</div>
            <div class="v" [style.color]="d.kpis.readyToLoad ? 'var(--success)' : ''">{{ d.kpis.readyToLoad | num }}</div>
            <div class="m">zakaz</div>
            <span class="ic"><ui-icon name="truck" [size]="30" /></span>
          </div>
          <div class="stat">
            <div class="k">{{ 'kpi_defect_rate' | t }}</div>
            <div class="v">{{ d.kpis.defectRate }}%</div>
            <div class="m">{{ d.kpis.defectQty | num }} {{ 'pieces' | t }}</div>
            <span class="ic"><ui-icon name="alert-circle" [size]="30" /></span>
          </div>
        </div>

        <!-- stages -->
        <h2 class="mb-3" style="font-size:15px">{{ 'dash_stages' | t }}</h2>
        <div class="stage-grid mb-6">
          @for (s of d.stages; track s.stage) {
            <a class="stage-card" [routerLink]="['/production', slug(s.stage)]">
              <div class="row-between">
                <div class="name">
                  <span class="s-ic"><ui-icon [name]="icon(s.stage)" [size]="16" /></span>
                  {{ 'stage_' + s.stage | t }}
                </div>
                <div class="pct" [style.color]="pctColor(s.progress)">{{ s.progress }}%</div>
              </div>
              <dl>
                <dt>{{ 'plan_label' | t }}</dt><dd>{{ s.plan | num }}</dd>
                <dt>{{ 'actual_label' | t }}</dt><dd>{{ s.done | num }}</dd>
                <dt>{{ 'remaining_label' | t }}</dt><dd>{{ s.remaining | num }}</dd>
                <dt>{{ 'defect_label' | t }}</dt><dd [style.color]="s.defect ? 'var(--danger)' : ''">{{ s.defect | num }}</dd>
              </dl>
              <ui-progress [value]="s.done" [max]="s.plan" [showLabel]="false" />
            </a>
          }
        </div>

        <div class="grid two mb-6">
          <!-- trend -->
          <div class="card">
            <div class="card-head"><h3>{{ 'dash_trend' | t }}</h3></div>
            <div class="card-body">
              @if (maxTrend() > 0) {
                <div class="chart">
                  @for (p of d.trend; track p.date) {
                    <div class="bar-col" [title]="p.date + ' — ' + p.qty + ' dona'">
                      <div class="bar-stack">
                        @if (p.defect > 0) {
                          <div class="bar defect" [style.height.%]="(p.defect / maxTrend()) * 100"></div>
                        }
                        <div class="bar" [style.height.%]="(p.qty / maxTrend()) * 100"></div>
                      </div>
                      <div class="bar-x">{{ p.date.slice(8) }}</div>
                    </div>
                  }
                </div>
                <div class="row gap-4 mt-3 tiny text-3">
                  <span class="row gap-2"><i class="lg-dot" style="background:var(--primary-500)"></i>{{ 'actual_label' | t }}</span>
                  <span class="row gap-2"><i class="lg-dot" style="background:var(--danger)"></i>{{ 'defect_label' | t }}</span>
                </div>
              } @else {
                <ui-empty icon="chart-column" [title]="'no_data' | t" />
              }
            </div>
          </div>

          <!-- upcoming -->
          <div class="card">
            <div class="card-head">
              <h3>{{ 'dash_upcoming' | t }}</h3>
              <a class="btn btn-ghost btn-sm" routerLink="/orders">{{ 'all' | t }} <ui-icon name="chevron-right" [size]="14" /></a>
            </div>
            <div class="table-wrap">
              <table class="data">
                <tbody>
                  @for (o of d.upcoming; track o.id) {
                    <tr class="clickable" [routerLink]="['/orders', o.id]">
                      <td>
                        <div class="bold mono">{{ o.number }}</div>
                        <div class="tiny text-3 truncate" style="max-width:180px">{{ o.model || o.client }}</div>
                      </td>
                      <td class="num">{{ o.qty | num }}</td>
                      <td style="width:130px"><ui-progress [value]="o.progress" [max]="100" [late]="o.isLate" [showLabel]="false" /></td>
                      <td class="nowrap">
                        <div class="small" [class.late]="o.isLate">{{ o.deadline | shortDate }}</div>
                        <div class="tiny" [style.color]="o.isLate ? 'var(--danger)' : 'var(--text-3)'">
                          {{ o.isLate ? ('days_late' | t: { n: -o.daysLeft }) : ('days_left' | t: { n: o.daysLeft }) }}
                        </div>
                      </td>
                      <td><ui-status [value]="o.status" /></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5"><ui-empty icon="clipboard-list" [title]="'no_orders' | t" /></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="grid two">
          <!-- recent -->
          <div class="card">
            <div class="card-head">
              <h3>{{ 'dash_recent' | t }}</h3>
              @if (rt.connected()) { <span class="badge badge-success"><i class="dot"></i>LIVE</span> }
            </div>
            <div class="feed">
              @for (r of d.recent; track r.id) {
                <a class="feed-row" [routerLink]="['/orders', r.order.id]">
                  <span class="feed-ic" [class.tg]="r.source === 'TELEGRAM'">
                    <ui-icon [name]="r.source === 'TELEGRAM' ? 'send' : icon(r.stage)" [size]="15" />
                  </span>
                  <span class="grow" style="min-width:0">
                    <span class="row gap-2">
                      <b class="mono small">{{ r.order.number }}</b>
                      <span class="small text-2">{{ 'stage_' + r.stage | t }}</span>
                      <span class="badge badge-info">+{{ r.qty }}</span>
                      @if (r.defectQty) { <span class="badge badge-danger">brak {{ r.defectQty }}</span> }
                    </span>
                    <span class="tiny text-3">{{ r.user }} · {{ r.progress }}%</span>
                  </span>
                  <span class="tiny text-3 nowrap">{{ r.at | ago }}</span>
                </a>
              } @empty {
                <ui-empty icon="history" [title]="'no_data' | t" />
              }
            </div>
          </div>

          <!-- defects -->
          <div class="card">
            <div class="card-head"><h3>{{ 'dash_defects' | t }}</h3></div>
            <div class="card-body">
              @if (totalDefects() > 0) {
                <div class="col gap-3">
                  @for (x of d.defects; track x.stage) {
                    <div>
                      <div class="row-between small mb-2">
                        <span>{{ 'stage_' + x.stage | t }}</span>
                        <span class="text-3">{{ x.qty | num }} {{ 'pieces' | t }} · {{ x.count }} ta yozuv</span>
                      </div>
                      <div class="progress late"><i [style.width.%]="(x.qty / maxDefect()) * 100"></i></div>
                    </div>
                  }
                </div>
              } @else {
                <ui-empty icon="check-circle" title="Brak qayd etilmagan" />
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
    .s-ic { width: 26px; height: 26px; border-radius: 7px; background: var(--primary-50); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; }
    a.stage-card { text-decoration: none; color: inherit; display: block; }
    a.stage-card:hover { text-decoration: none; border-color: var(--border-strong); }

    .chart { display: flex; align-items: flex-end; gap: 5px; height: 168px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
    .bar-stack { flex: 1; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; }
    .bar { width: 100%; background: var(--primary-500); border-radius: 3px 3px 0 0; min-height: 2px; transition: height .3s ease; }
    .bar.defect { background: var(--danger); border-radius: 3px 3px 0 0; }
    .bar-x { font-size: 10px; color: var(--text-3); }
    .lg-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

    .feed { max-height: 380px; overflow-y: auto; }
    .feed-row { display: flex; align-items: center; gap: 11px; padding: 10px 16px; border-bottom: 1px solid var(--border); text-decoration: none; color: inherit; }
    .feed-row:last-child { border-bottom: none; }
    .feed-row:hover { background: var(--surface-2); text-decoration: none; }
    .feed-ic { width: 30px; height: 30px; border-radius: 8px; background: var(--surface-3); color: var(--text-2); display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
    .feed-ic.tg { background: var(--info-bg); color: var(--info); }
    .late { color: var(--danger); font-weight: 600; }
  `],
})
export class DashboardComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly rt = inject(RealtimeService);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(false);
  readonly now = new Date();

  readonly maxTrend = computed(() => Math.max(1, ...(this.data()?.trend ?? []).map((p) => p.qty)));
  readonly maxDefect = computed(() => Math.max(1, ...(this.data()?.defects ?? []).map((d) => d.qty)));
  readonly totalDefects = computed(() => (this.data()?.defects ?? []).reduce((a, d) => a + d.qty, 0));

  constructor() {
    this.load();
    // Live: any production event refreshes the board without a manual reload.
    effect(() => {
      this.rt.tick();
      if (this.data()) this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<DashboardData>('/dashboard').subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  icon(stage: StageType): string { return STAGE_ICON[stage] ?? 'circle-dot'; }
  slug(stage: StageType): string { return stage.toLowerCase(); }
  pctColor(p: number): string {
    return p >= 100 ? 'var(--success)' : p >= 50 ? 'var(--primary-500)' : p > 0 ? 'var(--warning)' : 'var(--text-3)';
  }
}
