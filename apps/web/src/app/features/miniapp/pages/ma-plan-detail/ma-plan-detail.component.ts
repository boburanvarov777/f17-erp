import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { PlanView } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { NumPipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { haptic } from '../../utils/telegram';

type PeriodKey = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  DAILY: 'ma_stat_daily',
  WEEKLY: 'ma_stat_weekly',
  MONTHLY: 'ma_stat_monthly',
};

@Component({
  selector: 'app-ma-plan-detail',
  templateUrl: './ma-plan-detail.component.html',
  styleUrl: './ma-plan-detail.component.scss',
  standalone: true,
  imports: [IconComponent, LoadingComponent, EmptyComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
