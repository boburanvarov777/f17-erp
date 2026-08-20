import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { PlanView } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { haptic } from './telegram';

type PeriodKey = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  DAILY: 'ma_stat_daily',
  WEEKLY: 'ma_stat_weekly',
  MONTHLY: 'ma_stat_monthly',
};

@Component({
  selector: 'app-ma-plan-detail',
  standalone: true,
  imports: [IconComponent, LoadingComponent, EmptyComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head row gap-2 mb-3">
      <button class="btn btn-ghost btn-icon btn-sm back" type="button" (click)="back()" [attr.data-tip]="'back' | t">
        <ui-icon name="arrow-left" [size]="18" />
      </button>
      <h2 style="font-size:17px;margin:0">{{ titleKey() | t }}</h2>
    </div>

    @if (loading()) {
      <ui-loading [count]="4" [height]="64" />
    } @else if (plan(); as p) {
      <div class="summary card card-pad mb-3">
        <div class="row-between">
          <div>
            <div class="tiny text-3">{{ 'ma_plan_total_done' | t }}</div>
            <div class="summary-qty">{{ p.producedQty | num }}</div>
            <div class="tiny text-3">{{ 'pieces' | t }}</div>
          </div>
          @if (totalDefect() > 0) {
            <span class="badge badge-danger">{{ 'defect_label' | t }} {{ totalDefect() | num }}</span>
          }
        </div>
      </div>

      <div class="tiny text-3 mb-2">{{ 'ma_plan_by_order' | t }}</div>

      @if (rows().length) {
        <div class="col gap-2">
          @for (r of rows(); track r.orderId) {
            <div class="row-card card card-pad">
              <div class="grow" style="min-width:0">
                <div class="mono bold small">{{ r.orderNumber }}</div>
                <div class="tiny text-3 truncate">{{ r.modelCode }}@if (r.modelName) { · {{ r.modelName }} }</div>
              </div>
              <div class="stats">
                <div class="stat-qty">{{ r.qty | num }}</div>
                <div class="tiny text-3">{{ 'pieces' | t }}</div>
                @if (r.defectQty > 0) {
                  <span class="badge badge-danger stat-defect">{{ 'defect_label' | t }} {{ r.defectQty | num }}</span>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <ui-empty icon="clipboard-list" [title]="'ma_no_work_period' | t" />
      }
    }
  `,
  styles: [`
    .head { align-items: center; }
    .back { flex: 0 0 auto; margin-left: -4px; }
    .summary-qty { font-size: 32px; font-weight: 700; line-height: 1.05; color: var(--primary-600); font-variant-numeric: tabular-nums; }
    .row-card { display: flex; align-items: center; gap: 12px; }
    .stats { text-align: right; flex: 0 0 auto; }
    .stat-qty { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .stat-defect { margin-top: 4px; font-size: 10px; padding: 2px 7px; border-radius: 999px; }
  `],
})
export class MaPlanDetailComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  readonly i18n = inject(I18nService);

  readonly loading = signal(true);
  readonly plan = signal<PlanView | null>(null);

  readonly period = computed<PeriodKey>(() => {
    const raw = this.route.snapshot.paramMap.get('period')?.toUpperCase();
    return raw === 'WEEKLY' || raw === 'MONTHLY' ? raw : 'DAILY';
  });

  readonly titleKey = computed(() => PERIOD_LABELS[this.period()]);

  readonly rows = computed(() => {
    const items = this.plan()?.byModel ?? [];
    return items
      .filter((r) => r.qty > 0 || r.defectQty > 0)
      .sort((a, b) => b.qty - a.qty || b.defectQty - a.defectQty);
  });

  readonly totalDefect = computed(() =>
    (this.plan()?.byModel ?? []).reduce((a, r) => a + (r.defectQty || 0), 0),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<PlanView>(`/plans/${this.period()}`).subscribe({
      next: (v) => { this.plan.set(v); this.loading.set(false); },
      error: () => { this.plan.set(null); this.loading.set(false); },
    });
  }

  back(): void {
    haptic('success');
    if (typeof history !== 'undefined' && history.length > 1) this.location.back();
    else void this.router.navigate(['/miniapp/home']);
  }
}
