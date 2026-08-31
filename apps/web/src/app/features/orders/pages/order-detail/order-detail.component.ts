import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Client, Order, ProductModel, StageType } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AgoPipe, InitialsPipe, NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { PriorityBadgeComponent } from '../../../../shared/ui/priority-badge/priority-badge.component';
import { OrderFormComponent } from '../../components/order-form/order-form.component';

interface HistoryRow { at: string; kind: string; stage: string | null; text: string; user: string | null; source: string; }

const STAGE_ICON: Record<string, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
  standalone: true,
  imports: [
    NgTemplateOutlet, FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PriorityBadgeComponent,
    EmptyComponent, LoadingComponent, OrderFormComponent, TPipe, NumPipe, ShortDatePipe, AgoPipe, InitialsPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly rt = inject(RealtimeService);

  readonly id = input<string>('');
  readonly embedId = input<string>('');
  readonly embedded = input(false);

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
  readonly readOnly = computed(() => this.embedded() || !!this.order()?.archivedAt);
  readonly activeId = computed(() => (this.embedded() ? this.embedId() : this.id()) || '');
  /** Only warn when the sample is actively tracked and cutting is still running. */
  readonly sampleWarning = computed(() => {
    const o = this.order();
    if (!o?.sampleStatus || o.sampleStatus === 'APPROVED') return false;
    const cutting = o.stages?.find((s) => s.stage === 'CUTTING');
    return !!cutting && cutting.doneQty > 0 && cutting.doneQty < cutting.planQty;
  });

  constructor() {
    effect(() => { const id = this.activeId(); if (id) this.load(id); });
    effect(() => {
      if (this.embedded()) return;
      const ev = this.rt.lastProduction();
      if (ev && ev.orderId === this.activeId()) this.load(this.activeId());
    });

    effect(() => {
      if (this.embedded()) return;
      this.api.get<Client[]>('/clients').subscribe({ next: (c) => this.clients.set(c), error: () => void 0 });
      this.api.get<{ items: ProductModel[] }>('/models', { limit: 200 }).subscribe({
        next: (m) => this.models.set(m.items), error: () => void 0,
      });
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

  defectTypeLabel(type: string): string {
    if (type === 'production_entry') return this.i18n.t('defect_type_production_entry');
    return type;
  }

  print(): void { window.print(); }
}
