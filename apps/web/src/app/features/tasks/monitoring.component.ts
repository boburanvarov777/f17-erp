import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department, PlanView } from '../../core/models';
import { deptLabel } from '../../core/dept-label';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { DigitsOnlyDirective } from '../../shared/directives/digits-only.directive';
import { InitialsPipe, NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';

interface Row {
  id: string; firstName: string; lastName: string; position?: string; avatar?: string;
  department?: { nameUz: string; nameRu?: string; nameEn?: string; code: string } | null;
  today: { total: number; done: number };
  week: { total: number; done: number };
  month: { total: number; done: number };
  dailyPlan: { targetQty: number; doneQty: number };
  overdue: number; progress: number;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [
    FormsModule, ProgressComponent, EmptyComponent, LoadingComponent, ModalComponent, IconComponent,
    TPipe, InitialsPipe, NumPipe, DigitsOnlyDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'monitoring_title' | t }}</div>
          <div class="sub">{{ i18n.t('employees_count', { n: rows().length }) }}</div>
        </div>
        <select class="select btn-sm" style="width:auto;height:32px" [(ngModel)]="departmentId" (ngModelChange)="load()">
          <option value="">{{ 'department' | t }}: {{ 'all' | t }}</option>
          @for (d of departments(); track d.id) { <option [value]="d.id">{{ deptName(d) }}</option> }
        </select>
      </div>

      <div class="card">
        @if (loading()) { <ui-loading /> }
        @else if (rows().length) {
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                <th>{{ 'full_name' | t }}</th><th>{{ 'department' | t }}</th>
                <th>{{ 'daily_plan' | t }}</th>
                <th>{{ 'today' | t }}</th><th>{{ 'this_week' | t }}</th><th>{{ 'this_month' | t }}</th>
                <th style="width:170px">{{ 'progress' | t }}</th><th class="num">{{ 'overdue' | t }}</th>
                <th class="actions">{{ 'actions' | t }}</th>
              </tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    <td>
                      <div class="row gap-3">
                        <span class="avatar sm">{{ r.firstName | initials: r.lastName }}</span>
                        <span>
                          <span class="small bold" style="display:block">{{ r.lastName }} {{ r.firstName }}</span>
                          <span class="tiny text-3">{{ r.position || '—' }}</span>
                        </span>
                      </div>
                    </td>
                    <td class="small">{{ deptRow(r) }}</td>
                    <td class="mono small">
                      {{ r.dailyPlan.doneQty | num }} / {{ r.dailyPlan.targetQty | num }}
                    </td>
                    <td class="mono small">{{ r.today.done }} / {{ r.today.total }}</td>
                    <td class="mono small">{{ r.week.done }} / {{ r.week.total }}</td>
                    <td class="mono small">{{ r.month.done }} / {{ r.month.total }}</td>
                    <td><ui-progress [value]="r.progress" [max]="100" /></td>
                    <td class="num" [style.color]="r.overdue ? 'var(--danger)' : ''">{{ r.overdue || '—' }}</td>
                    <td class="actions">
                      <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="openDaily(r)" [attr.data-tip]="'view_daily_breakdown' | t">
                        <ui-icon name="eye" [size]="15" />
                      </button>
                      @if (auth.can('plans.update')) {
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="openPlan(r)" [attr.data-tip]="'set_daily_norm' | t">
                          <ui-icon name="pencil" [size]="15" />
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <ui-empty icon="users" [title]="'no_data' | t" /> }
      </div>
    </div>

    @if (dailyModal(); as ctx) {
      <ui-modal size="lg" [title]="'view_daily_breakdown' | t" [subtitle]="ctx.row.lastName + ' ' + ctx.row.firstName" (closed)="dailyModal.set(null)">
        @if (ctx.loading) { <ui-loading [count]="3" [height]="44" /> }
        @else if (ctx.plan; as plan) {
          <div class="stats mb-4">
            <div class="stat"><div class="k">{{ 'plan_label' | t }}</div><div class="v">{{ plan.targetQty | num }}</div></div>
            <div class="stat"><div class="k">{{ 'actual_label' | t }}</div><div class="v" style="color:var(--success)">{{ plan.producedQty | num }}</div></div>
          </div>
          <b class="small">{{ 'daily_by_model' | t }}</b>
          @if (plan.byModel?.length) {
            <div class="table-wrap mt-2">
              <table class="data">
                <thead><tr>
                  <th>{{ 'order_no' | t }}</th><th>{{ 'model' | t }}</th><th>{{ 'stage' | t }}</th>
                  <th class="num">{{ 'quantity' | t }}</th><th class="num">{{ 'defect_label' | t }}</th>
                </tr></thead>
                <tbody>
                  @for (m of plan.byModel; track m.orderId + m.stage) {
                    <tr>
                      <td class="mono small">{{ m.orderNumber }}</td>
                      <td>
                        <div class="small bold">{{ m.modelCode }}</div>
                        @if (m.modelName) { <div class="tiny text-3">{{ m.modelName }}</div> }
                      </td>
                      <td class="small">{{ 'stage_' + m.stage | t }}</td>
                      <td class="num bold">{{ m.qty | num }}</td>
                      <td class="num">{{ m.defectQty ? (m.defectQty | num) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <ui-empty icon="history" [title]="'no_daily_entries' | t" />
          }
        }
        <div footer><button class="btn" type="button" (click)="dailyModal.set(null)">{{ 'close' | t }}</button></div>
      </ui-modal>
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
})
export class MonitoringComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly rows = signal<Row[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly planModal = signal<Row | null>(null);
  readonly dailyModal = signal<{ row: Row; plan?: PlanView; loading: boolean } | null>(null);
  readonly planBusy = signal(false);
  departmentId = '';
  planTarget = 0;

  constructor() {
    this.load();
    this.api.get<Department[]>('/departments').subscribe({ next: (d) => this.departments.set(d), error: () => void 0 });
  }

  deptName(d: Department): string {
    return deptLabel(d, this.i18n.lang());
  }

  deptRow(r: Row): string {
    return r.department ? deptLabel(r.department, this.i18n.lang()) : '—';
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Row[]>('/users/monitoring', { departmentId: this.departmentId }).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openPlan(r: Row): void {
    this.planTarget = r.dailyPlan.targetQty;
    this.planModal.set(r);
  }

  openDaily(r: Row): void {
    this.dailyModal.set({ row: r, loading: true });
    this.api.get<PlanView>('/plans/DAILY', { userId: r.id }).subscribe({
      next: (plan) => this.dailyModal.set({ row: r, plan, loading: false }),
      error: () => {
        this.toast.error(this.i18n.t('error'));
        this.dailyModal.set(null);
      },
    });
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
        this.load();
      },
      error: (e) => {
        this.planBusy.set(false);
        const m = e?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }
}
