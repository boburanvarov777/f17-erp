import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Client, Order, ProductModel, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { AgoPipe, InitialsPipe, NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { OrderFormComponent } from './order-form.component';

interface HistoryRow { at: string; kind: string; stage: string | null; text: string; user: string | null; source: string; }

const STAGE_ICON: Record<string, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PriorityBadgeComponent,
    EmptyComponent, LoadingComponent, OrderFormComponent, TPipe, NumPipe, ShortDatePipe, AgoPipe, InitialsPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (loading() && !order()) {
        <ui-loading [count]="5" [height]="70" />
      } @else if (order(); as o) {
        <div class="breadcrumb no-print">
          <a routerLink="/orders">{{ 'orders_title' | t }}</a>
          <ui-icon name="chevron-right" [size]="13" />
          <span>{{ o.number }}</span>
        </div>

        <div class="page-head">
          <div>
            <div class="row gap-3">
              <span class="title mono">{{ o.number }}</span>
              <ui-status [value]="o.status" />
              <ui-priority [value]="o.priority" />
              @if (o.isLate) { <span class="badge badge-danger"><ui-icon name="alert-triangle" [size]="12" /> {{ 'late_badge' | t }}</span> }
            </div>
            <div class="sub">
              {{ o.model ? o.model.code + ' — ' + o.model.name : '—' }} · {{ o.client?.name }} · {{ o.qty | num }} {{ 'pieces' | t }}
            </div>
          </div>
          <div class="row gap-2 no-print">
            <button class="btn btn-sm" type="button" (click)="print()" [attr.data-tip]="'print' | t"><ui-icon name="printer" [size]="15" /> {{ 'print' | t }}</button>
            @if (auth.can('orders.update')) {
              <button class="btn btn-sm" type="button" (click)="editing.set(o)" [attr.data-tip]="'edit' | t"><ui-icon name="pencil" [size]="15" /> {{ 'edit' | t }}</button>
            }
          </div>
        </div>

        <!-- summary -->
        <div class="stats mb-6">
          <div class="stat"><div class="k">{{ 'quantity' | t }}</div><div class="v">{{ o.qty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'completed' | t }}</div><div class="v" style="color:var(--success)">{{ o.completedQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'remaining' | t }}</div><div class="v">{{ o.remainingQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'defect_label' | t }}</div><div class="v" [style.color]="totalDefects() ? 'var(--danger)' : ''">{{ totalDefects() | num }}</div></div>
          <div class="stat">
            <div class="k">{{ 'deadline' | t }}</div>
            <div class="v" style="font-size:19px" [style.color]="o.isLate ? 'var(--danger)' : ''">{{ o.deadline | shortDate }}</div>
            <div class="m">{{ 'order_date' | t }}: {{ o.orderDate | shortDate }}</div>
          </div>
        </div>

        <!-- production chain -->
        <div class="card mb-6">
          <div class="card-head row-between">
            <h3>{{ 'production_progress' | t }}</h3>
            <span class="small text-3">{{ chainDoneCount(o) }} / {{ o.stages?.length ?? 0 }}</span>
          </div>
          <div class="card-body">
            <div class="pipeline-track" aria-hidden="true">
              @for (s of o.stages; track s.stage) {
                <span class="track-seg" [class.done]="s.status === 'COMPLETED'" [class.active]="s.status === 'IN_PROGRESS'"></span>
              }
            </div>
            <div class="pipeline-grid">
              @for (s of o.stages; track s.stage; let i = $index) {
                <a
                  class="pipeline-card"
                  [routerLink]="['/production', s.stage.toLowerCase()]"
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
                    <ui-status [value]="s.status" [wrap]="true" />
                    @if (s.defectQty) {
                      <span class="badge badge-danger pipeline-defect" [attr.data-tip]="'defect_label' | t">
                        <ui-icon name="alert-triangle" [size]="11" />
                        {{ s.defectQty | num }}
                      </span>
                    }
                  </div>

                  @if (s.responsible) {
                    <div class="pipeline-user" [attr.title]="s.responsible.lastName + ' ' + s.responsible.firstName">
                      {{ s.responsible.lastName }} {{ s.responsible.firstName }}
                    </div>
                  }
                </a>
              }
            </div>
          </div>
        </div>

        <!-- tabs -->
        <div class="tabs mb-4 no-print">
          @for (t of tabs; track t) {
            <button type="button" [class.active]="tab() === t" (click)="setTab(t)">{{ tabLabel(t) | t }}</button>
          }
        </div>

        @switch (tab()) {
          @case ('general') {
            <div class="grid two">
              <div class="card">
                <div class="card-head"><h3>{{ 'general' | t }}</h3></div>
                <div class="card-body">
                  <dl class="kv">
                    <dt>{{ 'client' | t }}</dt><dd>{{ o.client?.name || '—' }}</dd>
                    <dt>{{ 'model' | t }}</dt>
                    <dd>@if (o.model) { <a [routerLink]="['/models', o.model.id]">{{ o.model.code }} — {{ o.model.name }}</a> } @else { — }</dd>
                    <dt>{{ 'fabric' | t }}</dt><dd>{{ o.model?.fabric || '—' }}</dd>
                    <dt>{{ 'responsible' | t }}</dt><dd>{{ o.responsible ? o.responsible.lastName + ' ' + o.responsible.firstName : '—' }}</dd>
                    <dt>{{ 'created' | t }}</dt><dd>{{ o.createdBy ? o.createdBy.lastName + ' ' + o.createdBy.firstName : '—' }}</dd>
                    <dt>{{ 'note' | t }}</dt><dd>{{ o.note || '—' }}</dd>
                  </dl>
                  <div class="divider"></div>
                  <div class="row-between">
                    <b class="small">{{ 'sample' | t }}</b>
                    @if (o.sampleStatus) { <ui-status [value]="o.sampleStatus" /> } @else { <span class="small text-3">{{ 'sample_not_tracked' | t }}</span> }
                  </div>
                  @if (o.sampleStatus) {
                    <dl class="kv mt-2">
                      <dt>{{ 'sample_sent' | t }}</dt><dd>{{ o.sampleSentAt ? (o.sampleSentAt | shortDate) : '—' }}</dd>
                      <dt>{{ 'sample_approved' | t }}</dt><dd>{{ o.sampleApprovedAt ? (o.sampleApprovedAt | shortDate) : '—' }}</dd>
                    </dl>
                    @if (sampleWarning()) {
                      <div class="badge badge-warning mt-3" style="width:100%;align-items:flex-start;justify-content:flex-start;padding:9px 11px;border-radius:var(--r);white-space:normal;text-align:left;line-height:1.4;height:auto">
                        <ui-icon name="alert-triangle" [size]="14" /> {{ 'sample_warning' | t }}
                      </div>
                    }
                  } @else {
                    <div class="small text-3 mt-2">{{ 'sample_not_tracked_hint' | t }}</div>
                  }
                </div>
              </div>

              <div class="card">
                <div class="card-head"><h3>{{ 'size_breakdown' | t }}</h3></div>
                <div class="card-body">
                  @if (o.sizes?.length) {
                    <div class="size-chips">
                      @for (s of o.sizes; track s.size + (s.color || '')) {
                        <div class="chip">
                          <span class="chip-k">{{ s.size }}</span>
                          <span class="chip-v">{{ s.qty | num }}</span>
                        </div>
                      }
                    </div>
                    <div class="row-between mt-4 bold">
                      <span>{{ 'total' | t }}</span>
                      <span>{{ sizeTotal() | num }} {{ 'pieces' | t }}</span>
                    </div>
                  } @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
                </div>
              </div>
            </div>
          }

          @case ('defects') {
            <div class="card">
              <div class="card-head"><h3>{{ 'order_defects' | t }}</h3></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'date' | t }}</th><th>{{ 'stage' | t }}</th><th>{{ 'defect_type' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th>{{ 'defect_reason' | t }}</th><th>{{ 'who' | t }}</th></tr></thead>
                  <tbody>
                    @for (d of o.defects; track d.id) {
                      <tr>
                        <td class="small nowrap">{{ d.date | shortDate: true }}</td>
                        <td><ui-status [value]="d.stage" prefix="stage_" /></td>
                        <td>{{ d.type }}</td>
                        <td class="num" style="color:var(--danger);font-weight:600">{{ d.qty }}</td>
                        <td class="small text-2">{{ d.reason || '—' }}</td>
                        <td class="small">{{ d.user ? d.user.lastName + ' ' + d.user.firstName : '—' }}</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="6"><ui-empty icon="check-circle" [title]="'no_defects' | t" /></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @case ('logistics') {
            <div class="card">
              <div class="card-head"><h3>{{ 'logistics' | t }}</h3></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'vehicle' | t }}</th><th>{{ 'driver' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th class="num">{{ 'box_count' | t }}</th><th>{{ 'loading_date' | t }}</th><th>{{ 'track_no' | t }}</th><th>{{ 'status' | t }}</th></tr></thead>
                  <tbody>
                    @for (s of o.shipments; track s.id) {
                      <tr>
                        <td>{{ s.vehicle || '—' }}</td>
                        <td>{{ s.driver || '—' }}<div class="tiny text-3">{{ s.driverPhone }}</div></td>
                        <td class="num">{{ s.qty | num }}</td>
                        <td class="num">{{ s.boxCount }}</td>
                        <td class="small">{{ s.loadingDate | shortDate }}</td>
                        <td class="mono small">{{ s.trackNo || '—' }}</td>
                        <td><ui-status [value]="s.status" /></td>
                      </tr>
                    } @empty {
                      <tr><td colspan="7"><ui-empty icon="truck" [title]="'no_data' | t" /></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @case ('history') {
            <div class="card">
              <div class="card-head"><h3>{{ 'history' | t }}</h3></div>
              <div class="timeline">
                @for (h of history(); track h.at + h.text) {
                  <div class="tl-row">
                    <div class="tl-dot" [class.audit]="h.kind === 'AUDIT'" [class.defect]="h.kind === 'DEFECT'"></div>
                    <div class="grow">
                      <div class="row gap-2 wrap">
                        <span class="small">{{ h.text }}</span>
                        @if (h.source === 'TELEGRAM') { <span class="badge badge-info"><ui-icon name="send" [size]="10" /> {{ 'source_telegram' | t }}</span> }
                      </div>
                      <div class="tiny text-3">{{ h.user || ('system' | t) }} · {{ h.at | shortDate: true }}</div>
                    </div>
                  </div>
                } @empty { <ui-empty icon="history" [title]="'no_data' | t" /> }
              </div>
            </div>
          }

          @case ('comments') {
            <div class="card">
              <div class="card-head"><h3>{{ 'order_comments' | t }}</h3></div>
              <div class="card-body">
                <div class="row gap-2 mb-4">
                  <input class="input" [(ngModel)]="commentText" [placeholder]="'add_comment' | t" (keyup.enter)="addComment()" />
                  <button class="btn btn-primary" type="button" (click)="addComment()" [disabled]="!commentText.trim()" [attr.data-tip]="'add_comment' | t">
                    <ui-icon name="send" [size]="15" />
                  </button>
                </div>
                @for (c of o.comments; track c.id) {
                  <div class="row gap-3 mb-4" style="align-items:flex-start">
                    <span class="avatar sm">{{ c.user?.firstName | initials: c.user?.lastName }}</span>
                    <div class="grow">
                      <div class="row gap-2">
                        <b class="small">{{ c.user?.lastName }} {{ c.user?.firstName }}</b>
                        <span class="tiny text-3">{{ c.createdAt | ago }}</span>
                      </div>
                      <div class="small text-2">{{ c.text }}</div>
                    </div>
                  </div>
                } @empty { <ui-empty icon="message-square" [title]="'no_data' | t" /> }
              </div>
            </div>
          }
        }
      }
    </div>

    @if (editing(); as o) {
      <app-order-form [order]="o" [clients]="clients()" [models]="models()"
                       (clientsChange)="clients.set($event)"
                       (saved)="onSaved()" (closed)="editing.set(null)" />
    }
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
    dl.kv { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
    dl.kv dt { color: var(--text-3); }
    dl.kv dd { margin: 0; font-weight: 450; }

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
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
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
      text-decoration: none;
      color: inherit;
      transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease;
    }
    .pipeline-card:hover {
      border-color: var(--border-strong);
      box-shadow: var(--sh-2);
      transform: translateY(-1px);
      text-decoration: none;
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
    .pipeline-step { display: block; margin-top: 2px; font-size: 10.5px; color: var(--text-3); letter-spacing: .02em; }

    .pipeline-metrics { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .pipeline-qty { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pipeline-pct { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }

    .pipeline-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .pipeline-foot ui-status { flex: 1 1 auto; min-width: 0; }
    .pipeline-foot .status-badge { max-width: 100%; }
    .pipeline-defect { flex-shrink: 0; gap: 4px; padding-inline: 8px; }

    .pipeline-user {
      font-size: 11.5px;
      color: var(--text-3);
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-top: 6px;
      border-top: 1px dashed var(--border);
    }

    @media (max-width: 900px) {
      .pipeline-track { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .pipeline-track { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    .size-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
    .chip { border: 1px solid var(--border); border-radius: var(--r); padding: 9px; text-align: center; background: var(--surface-2); }
    .chip-k { display: block; font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; }
    .chip-v { display: block; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }

    .timeline { max-height: 520px; overflow-y: auto; padding: 6px 18px 14px; }
    .tl-row { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
    .tl-row:last-child { border-bottom: none; }
    .tl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary-500); margin-top: 6px; flex: 0 0 auto; }
    .tl-dot.audit { background: var(--text-3); }
    .tl-dot.defect { background: var(--danger); }
  `],
})
export class OrderDetailComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly rt = inject(RealtimeService);

  readonly id = input.required<string>();

  readonly order = signal<Order | null>(null);
  readonly history = signal<HistoryRow[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly models = signal<ProductModel[]>([]);
  readonly loading = signal(false);
  readonly editing = signal<Partial<Order> | null>(null);
  readonly tab = signal<string>('general');
  commentText = '';

  readonly tabs = ['general', 'defects', 'logistics', 'history', 'comments'];

  readonly totalDefects = computed(() => (this.order()?.stages ?? []).reduce((a, s) => a + s.defectQty, 0));
  readonly sizeTotal = computed(() => (this.order()?.sizes ?? []).reduce((a, s) => a + s.qty, 0));
  /** Only warn when the sample is actively tracked and cutting is still running. */
  readonly sampleWarning = computed(() => {
    const o = this.order();
    if (!o?.sampleStatus || o.sampleStatus === 'APPROVED') return false;
    const cutting = o.stages?.find((s) => s.stage === 'CUTTING');
    return !!cutting && cutting.doneQty > 0 && cutting.doneQty < cutting.planQty;
  });

  constructor() {
    effect(() => { const id = this.id(); if (id) this.load(id); });
    // Push updates keep an open order card in sync with the shop floor.
    effect(() => {
      const ev = this.rt.lastProduction();
      if (ev && ev.orderId === this.id()) this.load(this.id());
    });

    this.api.get<Client[]>('/clients').subscribe({ next: (c) => this.clients.set(c), error: () => void 0 });
    this.api.get<{ items: ProductModel[] }>('/models', { limit: 200 }).subscribe({
      next: (m) => this.models.set(m.items), error: () => void 0,
    });
  }

  load(id: string): void {
    this.loading.set(true);
    this.api.get<Order>(`/orders/${id}`).subscribe({
      next: (o) => { this.order.set(o); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.get<HistoryRow[]>(`/orders/${id}/history`).subscribe({
      next: (h) => this.history.set(h), error: () => void 0,
    });
  }

  setTab(t: string): void { this.tab.set(t); }

  tabLabel(t: string): string {
    return ({ general: 'general', defects: 'order_defects', logistics: 'logistics', history: 'history', comments: 'order_comments' } as Record<string, string>)[t] ?? t;
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

  onSaved(): void {
    this.editing.set(null);
    this.toast.success(this.i18n.t('saved'));
    this.load(this.id());
  }

  addComment(): void {
    const text = this.commentText.trim();
    if (!text) return;
    this.api.post(`/orders/${this.id()}/comments`, { text }).subscribe({
      next: () => { this.commentText = ''; this.load(this.id()); },
      error: () => void 0,
    });
  }

  print(): void { window.print(); }
}
