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
              @if (o.isLate) { <span class="badge badge-danger"><ui-icon name="alert-triangle" [size]="12" /> Kechikkan</span> }
            </div>
            <div class="sub">
              {{ o.model ? o.model.code + ' — ' + o.model.name : '—' }} · {{ o.client?.name }} · {{ o.qty | num }} {{ 'pieces' | t }}
            </div>
          </div>
          <div class="row gap-2 no-print">
            <button class="btn btn-sm" type="button" (click)="print()"><ui-icon name="printer" [size]="15" /> {{ 'print' | t }}</button>
            @if (auth.can('orders.update')) {
              <button class="btn btn-sm" type="button" (click)="editing.set(o)"><ui-icon name="pencil" [size]="15" /> {{ 'edit' | t }}</button>
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
          <div class="card-head"><h3>{{ 'production_progress' | t }}</h3></div>
          <div class="card-body">
            <div class="chain">
              @for (s of o.stages; track s.stage; let last = $last) {
                <div class="chain-node">
                  <a class="node" [routerLink]="['/production', s.stage.toLowerCase()]" [class.done]="s.status === 'COMPLETED'" [class.active]="s.status === 'IN_PROGRESS'">
                    <span class="node-ic"><ui-icon [name]="stageIcon(s.stage)" [size]="17" /></span>
                    <span class="node-body">
                      <span class="node-name">{{ 'stage_' + s.stage | t }}</span>
                      <span class="node-qty">{{ s.doneQty | num }} / {{ s.planQty | num }}</span>
                      <ui-progress [value]="s.doneQty" [max]="s.planQty" [showLabel]="false" />
                      <span class="node-meta">
                        @if (s.defectQty) { <span class="badge badge-danger">brak {{ s.defectQty }}</span> }
                        @if (s.responsible) { <span class="tiny text-3">{{ s.responsible.lastName }}</span> }
                      </span>
                    </span>
                  </a>
                  @if (!last) { <div class="chain-arrow"><ui-icon name="chevron-right" [size]="16" /></div> }
                </div>
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
                  <b class="small">{{ 'sample' | t }}</b>
                  <dl class="kv mt-2">
                    <dt>{{ 'status' | t }}</dt><dd>{{ o.sampleStatus || '—' }}</dd>
                    <dt>{{ 'sample_sent' | t }}</dt><dd>{{ o.sampleSentAt | shortDate }}</dd>
                    <dt>{{ 'sample_approved' | t }}</dt><dd>{{ o.sampleApprovedAt | shortDate }}</dd>
                  </dl>
                  @if (sampleWarning()) {
                    <div class="badge badge-warning mt-3" style="width:100%;justify-content:flex-start;padding:9px 11px;border-radius:var(--r)">
                      <ui-icon name="alert-triangle" [size]="14" /> Kesim boshlangan, lekin namuna hali tasdiqlanmagan.
                    </div>
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
                        <td><span class="badge badge-neutral">{{ 'stage_' + d.stage | t }}</span></td>
                        <td>{{ d.type }}</td>
                        <td class="num" style="color:var(--danger);font-weight:600">{{ d.qty }}</td>
                        <td class="small text-2">{{ d.reason || '—' }}</td>
                        <td class="small">{{ d.user ? d.user.lastName + ' ' + d.user.firstName : '—' }}</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="6"><ui-empty icon="check-circle" title="Brak qayd etilmagan" /></td></tr>
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
                        @if (h.source === 'TELEGRAM') { <span class="badge badge-info"><ui-icon name="send" [size]="10" /> Telegram</span> }
                      </div>
                      <div class="tiny text-3">{{ h.user || 'Tizim' }} · {{ h.at | shortDate: true }}</div>
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
                  <button class="btn btn-primary" type="button" (click)="addComment()" [disabled]="!commentText.trim()">
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
      <app-order-form [order]="o" [clients]="clients()" [models]="models()" (saved)="onSaved()" (closed)="editing.set(null)" />
    }
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
    dl.kv { display: grid; grid-template-columns: minmax(110px, auto) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
    dl.kv dt { color: var(--text-3); }
    dl.kv dd { margin: 0; font-weight: 450; }

    .chain { display: flex; align-items: stretch; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
    .chain-node { display: flex; align-items: center; flex: 1; min-width: 168px; }
    .node { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); flex: 1; text-decoration: none; color: inherit; transition: border-color .15s ease, background .15s ease; }
    .node:hover { border-color: var(--border-strong); text-decoration: none; }
    .node.done { background: var(--success-bg); border-color: var(--success-br); }
    .node.active { background: var(--warning-bg); border-color: var(--warning-br); }
    .node-ic { width: 30px; height: 30px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
    .node-body { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
    .node-name { font-size: 12.5px; font-weight: 600; }
    .node-qty { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
    .node-meta { display: flex; gap: 5px; align-items: center; }
    .chain-arrow { color: var(--text-3); padding: 0 2px; }

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
  readonly sampleWarning = computed(() => {
    const o = this.order();
    if (!o) return false;
    const cutting = o.stages?.find((s) => s.stage === 'CUTTING');
    return !!cutting && cutting.doneQty > 0 && o.sampleStatus !== 'APPROVED';
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
