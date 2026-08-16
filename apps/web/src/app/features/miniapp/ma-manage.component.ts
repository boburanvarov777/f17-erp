import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DashboardData } from '../../core/models';
import { userDepartmentId, userStage } from '../../core/role.util';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { DigitsOnlyDirective } from '../../shared/directives/digits-only.directive';
import { InitialsPipe, NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

interface Row {
  id: string; firstName: string; lastName: string; position?: string;
  department?: { nameUz: string; code: string } | null;
  dailyPlan: { targetQty: number; doneQty: number };
}

@Component({
  selector: 'app-ma-manage',
  standalone: true,
  imports: [
    FormsModule, IconComponent, ProgressComponent, LoadingComponent, EmptyComponent,
    ModalComponent, TPipe, NumPipe, InitialsPipe, DigitsOnlyDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="mb-3" style="font-size:17px">{{ 'ma_manage' | t }}</h2>

    @if (ma.seesFullManage() && ma.can('dashboard.read')) {
      @if (dashLoading()) { <ui-loading [count]="2" [height]="64" /> }
      @else if (dash(); as d) {
        <div class="kpi-grid mb-4">
          <div class="kpi"><div class="k">{{ 'kpi_active_orders' | t }}</div><div class="v">{{ d.kpis.activeOrders | num }}</div></div>
          <div class="kpi"><div class="k">{{ 'kpi_in_production' | t }}</div><div class="v">{{ d.kpis.inProductionQty | num }}</div></div>
          <div class="kpi"><div class="k">{{ 'kpi_late' | t }}</div><div class="v" [style.color]="d.kpis.lateOrders ? 'var(--danger)' : ''">{{ d.kpis.lateOrders | num }}</div></div>
          <div class="kpi"><div class="k">{{ 'kpi_defect_rate' | t }}</div><div class="v">{{ d.kpis.defectRate }}%</div></div>
        </div>

        <div class="small bold mb-2">{{ 'dash_stages' | t }}</div>
        <div class="col gap-2 mb-4">
          @for (s of d.stages; track s.stage) {
            <div class="stage-row">
              <span class="small">{{ 'stage_' + s.stage | t }}</span>
              <ui-progress [value]="s.done" [max]="s.plan || 1" />
              <span class="mono tiny">{{ s.progress }}%</span>
            </div>
          }
        </div>
      }
    } @else if (ownStage(); as st) {
      @if (dashLoading()) { <ui-loading [count]="1" [height]="64" /> }
      @else if (ownStageStats(); as s) {
        <div class="dept-card mb-4">
          <div class="row-between mb-2">
            <span class="small bold">{{ 'stage_' + s.stage | t }}</span>
            <span class="mono tiny">{{ s.progress }}%</span>
          </div>
          <ui-progress [value]="s.done" [max]="s.plan || 1" />
          <dl class="stats-kv mt-3">
            <dt>{{ 'plan_label' | t }}</dt><dd>{{ s.plan | num }}</dd>
            <dt>{{ 'actual_label' | t }}</dt><dd>{{ s.done | num }}</dd>
            <dt>{{ 'remaining_label' | t }}</dt><dd>{{ s.remaining | num }}</dd>
            <dt>{{ 'defect_label' | t }}</dt><dd [style.color]="s.defect ? 'var(--danger)' : ''">{{ s.defect | num }}</dd>
          </dl>
        </div>
      }
    }

    @if (ma.seesFullManage() && ma.can('plans.update', 'users.read')) {
      <div class="row-between mb-2">
        <div class="small bold">{{ 'ma_team_plans' | t }}</div>
        <span class="tiny text-3">{{ rows().length }} {{ 'employees' | t }}</span>
      </div>

      @if (loading()) { <ui-loading [count]="4" [height]="58" /> }
      @else if (rows().length) {
        <div class="col gap-2">
          @for (r of rows(); track r.id) {
            <div class="erow">
              <div class="row gap-3">
                <span class="avatar sm">{{ r.firstName | initials: r.lastName }}</span>
                <div class="grow">
                  <div class="small bold">{{ r.lastName }} {{ r.firstName }}</div>
                  <div class="tiny text-3">{{ r.department?.nameUz || '—' }}</div>
                </div>
                <button class="btn btn-ghost btn-sm" type="button" (click)="openPlan(r)" [disabled]="!ma.can('plans.update')">
                  <ui-icon name="pencil" [size]="14" />
                </button>
              </div>
              <div class="row-between mt-2 tiny">
                <span>{{ 'daily_plan' | t }}</span>
                <span class="mono">{{ r.dailyPlan.doneQty | num }} / {{ r.dailyPlan.targetQty | num }}</span>
              </div>
              <ui-progress [value]="r.dailyPlan.doneQty" [max]="r.dailyPlan.targetQty || 1" [showLabel]="false" />
            </div>
          }
        </div>
      } @else {
        <ui-empty icon="users" [title]="'no_data' | t" />
      }
    }

    @if (planModal(); as r) {
      <ui-modal [title]="'set_daily_norm' | t" [subtitle]="r.lastName + ' ' + r.firstName" (closed)="planModal.set(null)">
        <div class="field">
          <label class="label">{{ 'plan_target_qty' | t }}</label>
          <input class="input" type="tel" inputmode="numeric" digitsOnly [(ngModel)]="planTarget" />
          <div class="tiny text-3 mt-2">{{ 'plan_manager_hint' | t }}</div>
        </div>
        <div footer class="ma-modal-foot">
          <button class="btn" type="button" (click)="planModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="savePlan()" [disabled]="planBusy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 12px; }
    .kpi .k { font-size: 10.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; }
    .kpi .v { font-size: 22px; font-weight: 600; margin-top: 4px; }
    .dept-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 14px; }
    .stats-kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
    .stats-kv dt { color: var(--text-3); }
    .stats-kv dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .stage-row { display: grid; grid-template-columns: 88px 1fr 42px; gap: 8px; align-items: center; }
    .erow { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 12px; }
    .grow { flex: 1; min-width: 0; }
  `],
})
export class MaManageComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly dash = signal<DashboardData | null>(null);
  readonly dashLoading = signal(false);
  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly planModal = signal<Row | null>(null);
  readonly planBusy = signal(false);
  planTarget = 0;

  readonly ownStage = computed(() => userStage(this.ma.user()));
  readonly ownStageStats = computed(() => {
    const stage = this.ownStage();
    if (!stage) return null;
    return this.dash()?.stages.find((s) => s.stage === stage) ?? null;
  });

  constructor() {
    if (this.ma.can('dashboard.read') && (this.ma.seesFullManage() || this.ownStage())) {
      this.loadDash();
    }
    if (this.ma.seesFullManage() && this.ma.can('plans.update', 'users.read')) {
      this.loadRows();
    }
  }

  loadDash(): void {
    this.dashLoading.set(true);
    this.api.get<DashboardData>('/dashboard').subscribe({
      next: (d) => { this.dash.set(d); this.dashLoading.set(false); },
      error: () => this.dashLoading.set(false),
    });
  }

  loadRows(): void {
    this.loading.set(true);
    const deptId = userDepartmentId(this.ma.user());
    this.api.get<Row[]>('/users/monitoring', deptId ? { departmentId: deptId } : {}).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openPlan(r: Row): void {
    this.planTarget = r.dailyPlan.targetQty;
    this.planModal.set(r);
    haptic('success');
  }

  savePlan(): void {
    const r = this.planModal();
    if (!r) return;
    this.planBusy.set(true);
    this.api.post('/plans/DAILY', { userId: r.id, targetQty: +this.planTarget }).subscribe({
      next: () => {
        this.planBusy.set(false);
        this.planModal.set(null);
        this.toast.success(this.i18n.t('saved'));
        haptic('success');
        this.loadRows();
      },
      error: (e) => {
        this.planBusy.set(false);
        haptic('error');
        const m = e?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }
}
