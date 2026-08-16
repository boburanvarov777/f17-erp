import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { DigitsOnlyDirective } from '../../shared/directives/digits-only.directive';
import { InitialsPipe, NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';

interface Row {
  id: string; firstName: string; lastName: string; position?: string; avatar?: string;
  department?: { nameUz: string; code: string } | null;
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
    FormsModule, ProgressComponent, EmptyComponent, LoadingComponent, ModalComponent,
    TPipe, InitialsPipe, NumPipe, DigitsOnlyDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'monitoring_title' | t }}</div>
          <div class="sub">{{ rows().length }} ta xodim</div>
        </div>
        <select class="select btn-sm" style="width:auto;height:32px" [(ngModel)]="departmentId" (ngModelChange)="load()">
          <option value="">{{ 'department' | t }}: {{ 'all' | t }}</option>
          @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.nameUz }}</option> }
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
                    <td class="small">{{ r.department?.nameUz || '—' }}</td>
                    <td class="mono small">
                      {{ r.dailyPlan.doneQty | num }} / {{ r.dailyPlan.targetQty | num }}
                      @if (auth.can('plans.update')) {
                        <button class="btn btn-ghost btn-sm" type="button" style="margin-left:6px;height:26px" (click)="openPlan(r)" [attr.data-tip]="'set_daily_norm' | t">{{ 'edit' | t }}</button>
                      }
                    </td>
                    <td class="mono small">{{ r.today.done }} / {{ r.today.total }}</td>
                    <td class="mono small">{{ r.week.done }} / {{ r.week.total }}</td>
                    <td class="mono small">{{ r.month.done }} / {{ r.month.total }}</td>
                    <td><ui-progress [value]="r.progress" [max]="100" /></td>
                    <td class="num" [style.color]="r.overdue ? 'var(--danger)' : ''">{{ r.overdue || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <ui-empty icon="users" [title]="'no_data' | t" /> }
      </div>
    </div>

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
  private i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly rows = signal<Row[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly planModal = signal<Row | null>(null);
  readonly planBusy = signal(false);
  departmentId = '';
  planTarget = 0;

  constructor() {
    this.load();
    this.api.get<Department[]>('/departments').subscribe({ next: (d) => this.departments.set(d), error: () => void 0 });
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
