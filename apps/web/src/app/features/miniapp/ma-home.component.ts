import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OrderStage, Paginated, PlanModelBreakdown, PlanView } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

type PeriodKey = 'DAILY' | 'WEEKLY' | 'MONTHLY';

@Component({
  selector: 'app-ma-home',
  templateUrl: './ma-home.component.html',
  styleUrl: './ma-home.component.scss',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaHomeComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly entryFe = new FieldErrorsState();

  readonly periods: { key: PeriodKey; label: string }[] = [
    { key: 'DAILY', label: 'ma_stat_daily' },
    { key: 'WEEKLY', label: 'ma_stat_weekly' },
    { key: 'MONTHLY', label: 'ma_stat_monthly' },
  ];
  readonly quick = [10, 25, 50, 100, 200, 500];
  readonly plans = signal<Partial<Record<PeriodKey, PlanView>>>({});
  readonly loading = signal(true);
  readonly entryModal = signal(false);
  readonly entryBusy = signal(false);
  readonly entryError = signal('');
  readonly fallbackOrders = signal<PlanModelBreakdown[]>([]);

  entryOrderId = '';
  entryQty: number | null = null;
  entryDefect: number | null = null;
  entryNote = '';

  readonly isPacking = computed(() => this.ma.user()?.department?.stage === 'PACKING');

  constructor() {
    this.reloadPlans();
    effect(() => {
      if (this.ma.productionTick() > 0) this.reloadPlans();
    });
  }

  produced(key: PeriodKey): number {
    return this.plans()[key]?.producedQty ?? 0;
  }

  defect(key: PeriodKey): number {
    const entries = this.plans()[key]?.entries ?? [];
    return entries.reduce((a, e) => a + (e.defectQty || 0), 0);
  }

  entryOrders(): PlanModelBreakdown[] {
    const daily = this.plans()['DAILY'];
    const lines = daily?.lines?.length ? daily.lines : daily?.byModel ?? [];
    const active = lines.filter((l) => !l.targetQty || l.qty < (l.targetQty ?? 0));
    if (active.length) return active;
    if (lines.length) return lines;
    return this.fallbackOrders();
  }

  orderLabel(o: PlanModelBreakdown): string {
    return `${o.orderNumber} · ${o.modelCode}`;
  }

  reloadPlans(): void {
    this.loading.set(true);
    let pending = this.periods.length;
    for (const p of this.periods) {
      this.api.get<PlanView>(`/plans/${p.key}`).subscribe({
        next: (v) => {
          this.plans.update((m) => ({ ...m, [p.key]: v }));
          if (--pending === 0) this.loading.set(false);
        },
        error: () => { if (--pending === 0) this.loading.set(false); },
      });
    }
  }

  openEntry(): void {
    this.entryFe.reset();
    this.entryOrderId = '';
    this.entryQty = null;
    this.entryDefect = null;
    this.entryNote = '';
    this.entryError.set('');
    this.entryModal.set(true);
    haptic('success');
    this.loadFallbackOrders();
  }

  closeEntry(): void {
    this.entryModal.set(false);
  }

  loadFallbackOrders(): void {
    const slug = this.ma.user()?.department?.stage?.toLowerCase();
    if (!slug || this.entryOrders().length) return;
    this.api.get<Paginated<OrderStage>>(`/production/${slug}`, { limit: 50 }).subscribe({
      next: (d) => {
        this.fallbackOrders.set(
          d.items.filter((s) => s.status !== 'COMPLETED').map((s) => ({
            orderId: s.orderId ?? s.order?.id ?? '',
            orderNumber: s.order?.number ?? '—',
            modelCode: s.order?.model?.code ?? '—',
            stage: s.stage,
            qty: 0,
            defectQty: 0,
            targetQty: 0,
          })),
        );
      },
    });
  }

  saveEntry(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const slug = this.ma.user()?.department?.stage?.toLowerCase();
    if (!slug) {
      this.toast.error(this.i18n.t('ma_no_active_orders_msg'));
      haptic('error');
      return;
    }
    if (!this.entryFe.apply(runValidation([
      { key: 'orderId', label: t('ma_select_order'), value: this.entryOrderId, required: true, when: () => this.entryOrders().length > 0 },
      { key: 'qty', label: t('quantity'), value: this.entryQty, custom: (v) => isMissingQty(v) ? t('ma_enter_qty') : null },
    ], t))) {
      if (!this.entryOrders().length) this.toast.error(this.i18n.t('ma_no_active_orders_msg'));
      haptic('error');
      return;
    }

    this.entryBusy.set(true);
    this.entryError.set('');
    this.api.post(`/production/${slug}/entries`, {
      orderId: this.entryOrderId,
      qty: +this.entryQty!,
      defectQty: +(this.entryDefect || 0),
      date: new Date().toISOString(),
      note: this.isPacking() ? (this.entryNote || this.i18n.t('ma_source_miniapp')) : this.i18n.t('ma_source_miniapp'),
      source: 'MINIAPP',
    }).subscribe({
      next: () => {
        this.entryBusy.set(false);
        this.entryModal.set(false);
        this.toast.success(this.i18n.t('saved'));
        haptic('success');
        this.ma.notifyProduction();
        this.reloadPlans();
      },
      error: (e) => {
        this.entryBusy.set(false);
        haptic('error');
        const m = e?.error?.message;
        this.entryError.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }
}
