import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { Order, StageType } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';

const STAGE_ICON: Record<string, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

/** Read-only production flow — used from Archive and other compact previews. */
@Component({
  selector: 'app-order-flow-preview',
  templateUrl: './order-flow-preview.component.html',
  styleUrl: './order-flow-preview.component.scss',
  standalone: true,
  imports: [IconComponent, ProgressComponent, StatusBadgeComponent, LoadingComponent, EmptyComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderFlowPreviewComponent {
  private api = inject(ApiService);

  readonly orderId = input.required<string>();

  readonly order = signal<Order | null>(null);
  readonly loading = signal(false);

  readonly totalDefects = () => (this.order()?.stages ?? []).reduce((a, s) => a + s.defectQty, 0);

  constructor() {
    effect(() => {
      const id = this.orderId();
      if (id) this.load(id);
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.order.set(null);
    this.api.get<Order>(`/orders/${id}`).subscribe({
      next: (o) => { this.order.set(o); this.loading.set(false); },
      error: () => { this.order.set(null); this.loading.set(false); },
    });
  }

  stageIcon(s: StageType): string { return STAGE_ICON[s] ?? 'circle-dot'; }

  stagePct(s: { doneQty: number; planQty: number }): number {
    return s.planQty ? Math.round((s.doneQty / s.planQty) * 100) : 0;
  }

  stagePctColor(s: { doneQty: number; planQty: number; status: string }): string {
    const p = this.stagePct(s);
    if (p >= 100) return 'var(--success)';
    if (s.status === 'IN_PROGRESS') return 'var(--warning)';
    return 'var(--text-3)';
  }

  chainDoneCount(o: Order): number {
    return o.stages?.filter((s) => s.status === 'COMPLETED').length ?? 0;
  }
}
