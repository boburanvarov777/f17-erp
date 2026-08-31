import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardData, StageType } from '../../../../core/models';
import { seesFullManage, userStage } from '../../../../core/utils/role.util';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { AgoPipe, NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';

const STAGE_ICON: Record<StageType, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  standalone: true,
  imports: [RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, TPipe, NumPipe, ShortDatePipe, AgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly rt = inject(RealtimeService);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(false);
  readonly now = new Date();
  private rtTimer?: ReturnType<typeof setTimeout>;

  readonly view = computed(() => this.data());
  readonly fullManage = computed(() => seesFullManage(this.auth.user()));
  readonly visibleStages = computed(() => {
    const d = this.data();
    if (!d) return [];
    const stage = userStage(this.auth.user());
    if (this.fullManage() || !stage) return d.stages;
    return d.stages.filter((s) => s.stage === stage);
  });
  readonly deptTitle = computed(() => {
    const stage = userStage(this.auth.user());
    return stage ? `stage_${stage}` : 'dash_stages';
  });

  constructor() {
    this.load();
    effect(() => {
      this.rt.tick();
      if (!this.data()) return;
      clearTimeout(this.rtTimer);
      this.rtTimer = setTimeout(() => this.load(true), 500);
    });
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
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
