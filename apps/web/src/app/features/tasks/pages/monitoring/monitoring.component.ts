import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department, PlanView } from '../../../../core/models';
import { deptLabel } from '../../../../core/utils/dept-label';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { InitialsPipe, NumPipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { PlanLinesFormComponent } from '../../../../shared/components/plan-lines-form.component';

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
  templateUrl: './monitoring.component.html',
  standalone: true,
  imports: [
    FormsModule, ProgressComponent, EmptyComponent, LoadingComponent, ModalComponent, IconComponent,
    PlanLinesFormComponent,
    TPipe, InitialsPipe, NumPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    this.planModal.set(r);
  }

  onPlanSaved(): void {
    this.planModal.set(null);
    this.load();
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
}
