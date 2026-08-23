import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { Order, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const STAGE_ICON: Record<string, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

/** Read-only production flow — used from Archive and other compact previews. */
@Component({
  selector: 'app-order-flow-preview',
  standalone: true,
  imports: [IconComponent, ProgressComponent, StatusBadgeComponent, LoadingComponent, EmptyComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <ui-loading [count]="3" [height]="56" />
    } @else if (order(); as o) {
      <div class="flow-preview">
        <div class="stats compact mb-4">
          <div class="stat"><div class="k">{{ 'quantity' | t }}</div><div class="v">{{ o.qty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'completed' | t }}</div><div class="v" style="color:var(--success)">{{ o.completedQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'remaining' | t }}</div><div class="v">{{ o.remainingQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'defect_label' | t }}</div><div class="v" [style.color]="totalDefects() ? 'var(--danger)' : ''">{{ totalDefects() | num }}</div></div>
          <div class="stat"><div class="k">{{ 'deadline' | t }}</div><div class="v" style="font-size:17px">{{ o.deadline | shortDate }}</div></div>
        </div>

        <div class="flow-head row-between mb-3">
          <h4 class="small bold m-0">{{ 'production_progress' | t }}</h4>
          <span class="tiny text-3">{{ chainDoneCount(o) }} / {{ o.stages?.length ?? 0 }}</span>
        </div>

        <div class="pipeline-track" aria-hidden="true">
          @for (s of o.stages; track s.stage) {
            <span class="track-seg" [class.done]="s.status === 'COMPLETED'" [class.active]="s.status === 'IN_PROGRESS'"></span>
          }
        </div>

        <div class="pipeline-grid">
          @for (s of o.stages; track s.stage; let i = $index) {
            <div
              class="pipeline-card"
              [class.done]="s.status === 'COMPLETED'"
              [class.active]="s.status === 'IN_PROGRESS'"
              [class.waiting]="s.status === 'WAITING'"
              [class.idle]="s.status === 'NOT_STARTED' || s.status === 'BLOCKED' || s.status === 'DELAYED'"
            >
              <div class="pipeline-head">
                <span class="pipeline-icon"><ui-icon [name]="stageIcon(s.stage)" [size]="18" /></span>
                <div class="pipeline-title">
                  <span class="pipeline-name">{{ 'stage_' + s.stage | t }}</span>
                  <span class="pipeline-step">{{ i + 1 }} / {{ o.stages?.length ?? 0 }}</span>
                </div>
              </div>
              <div class="pipeline-metrics">
                <span class="pipeline-qty">{{ s.doneQty | num }} / {{ s.planQty | num }}</span>
                <span class="pipeline-pct" [style.color]="stagePctColor(s)">{{ stagePct(s) }}%</span>
              </div>
              <ui-progress [value]="s.doneQty" [max]="s.planQty" [showLabel]="false" />
              <div class="pipeline-foot">
                <ui-status [value]="s.status" [wrap]="true" [light]="true" />
                @if (s.defectQty) {
                  <span class="badge badge-danger badge-light pipeline-defect">
                    <ui-icon name="alert-triangle" [size]="11" />
                    {{ s.defectQty | num }}
                  </span>
                }
              </div>
              @if (s.responsible) {
                <div class="pipeline-user">{{ s.responsible.lastName }} {{ s.responsible.firstName }}</div>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <ui-empty icon="alert-circle" [title]="'error' | t" />
    }
  `,
  styles: [`
    .flow-preview { padding: 4px 2px 8px; }
    .stats.compact { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
    .stats.compact .stat { padding: 12px 14px; }
    .stats.compact .v { font-size: 20px; }
    .flow-head { align-items: center; }

    .pipeline-track {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 14px;
    }
    .track-seg {
      height: 5px;
      border-radius: 100px;
      background: var(--neutral-bg);
      border: 1px solid var(--neutral-br);
    }
    .track-seg.done { background: var(--success); border-color: var(--success-br); }
    .track-seg.active { background: var(--warning); border-color: var(--warning-br); }

    .pipeline-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .pipeline-card {
      display: flex;
      flex-direction: column;
      gap: 9px;
      min-width: 0;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      background: var(--surface-2);
    }
    .pipeline-card.done { background: var(--success-bg); border-color: var(--success-br); }
    .pipeline-card.active { background: var(--warning-bg); border-color: var(--warning-br); }
    .pipeline-card.waiting { background: var(--info-bg); border-color: var(--info-br); }
    .pipeline-card.idle { background: var(--surface-2); border-color: var(--border); opacity: .92; }

    .pipeline-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
    .pipeline-icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--surface); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      color: var(--text-2);
    }
    .pipeline-card.done .pipeline-icon { background: #fff; color: var(--success); border-color: var(--success-br); }
    .pipeline-card.active .pipeline-icon { background: #fff; color: var(--warning); border-color: var(--warning-br); }
    .pipeline-title { min-width: 0; flex: 1; }
    .pipeline-name { display: block; font-size: 13.5px; font-weight: 600; line-height: 1.25; }
    .pipeline-step { display: block; margin-top: 2px; font-size: 10.5px; color: var(--text-3); }

    .pipeline-metrics { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .pipeline-qty { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .pipeline-pct { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }

    .pipeline-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pipeline-defect { flex-shrink: 0; gap: 4px; padding-inline: 8px; }

    .pipeline-user {
      font-size: 11.5px;
      color: var(--text-3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-top: 6px;
      border-top: 1px dashed var(--border);
    }

    @media (max-width: 900px) {
      .pipeline-track { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  `],
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
