import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DashboardData, Department } from '../../core/models';
import { deptLabel } from '../../core/dept-label';
import { userDepartmentId, userStage } from '../../core/role.util';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { InitialsPipe, NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { PlanLinesFormComponent } from '../../shared/components/plan-lines-form.component';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

interface Row {
  id: string; firstName: string; lastName: string; position?: string;
  department?: { nameUz: string; nameRu?: string; nameEn?: string; code: string } | null;
  dailyPlan: { targetQty: number; doneQty: number };
}

@Component({
  selector: 'app-ma-manage',
  templateUrl: './ma-manage.component.html',
  styleUrl: './ma-manage.component.scss',
  standalone: true,
  imports: [
    FormsModule, IconComponent, ProgressComponent, LoadingComponent, EmptyComponent,
    ModalComponent, PlanLinesFormComponent,
    TPipe, NumPipe, InitialsPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  deptName(d: Pick<Department, 'nameUz'> & Partial<Pick<Department, 'nameRu' | 'nameEn'>>): string {
    return deptLabel(d, this.i18n.lang());
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
    this.planModal.set(r);
    haptic('success');
  }

  onPlanSaved(): void {
    this.planModal.set(null);
    this.loadRows();
  }
}
