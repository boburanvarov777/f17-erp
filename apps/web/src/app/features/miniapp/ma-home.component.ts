import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
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
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="mb-3" style="font-size:17px">{{ 'ma_plans' | t }}</h2>

    @if (loading()) {
      <ui-loading [count]="2" [height]="120" />
    } @else {
      <div class="today card card-pad">
        <div class="tiny text-3 mb-2">{{ 'ma_today_done' | t }}</div>
        <div class="today-qty">{{ produced('DAILY') | num }}</div>
        <div class="tiny text-3">{{ 'pieces' | t }}</div>
        @if (defect('DAILY') > 0) {
          <span class="badge badge-danger today-defect mt-2">{{ 'defect_label' | t }} {{ defect('DAILY') | num }}</span>
        }
        <button class="btn btn-primary btn-lg btn-block mt-4" type="button" (click)="openEntry()">
          <ui-icon name="plus" [size]="16" /> {{ 'ma_add_work' | t }}
        </button>
      </div>

      <div class="period-grid mt-4">
        @for (p of periods; track p.key) {
          <a class="period card card-pad" [routerLink]="['/miniapp/home', p.key.toLowerCase()]">
            <div class="tiny text-3">{{ p.label | t }}</div>
            <div class="period-qty">{{ produced(p.key) | num }}</div>
            @if (defect(p.key) > 0) {
              <span class="badge badge-danger period-defect">{{ defect(p.key) | num }}</span>
            }
          </a>
        }
      </div>
    }

    @if (entryModal()) {
      <ui-modal [title]="'ma_add_work' | t" (closed)="closeEntry()">
        @if (entryOrders().length) {
          <div class="field" [class.field-invalid]="entryFe.has('orderId')">
            <label class="label">{{ 'ma_select_order' | t }}</label>
            <select class="select" [(ngModel)]="entryOrderId" (ngModelChange)="entryFe.clear('orderId')">
              <option value="" disabled>{{ 'ma_select_order' | t }}</option>
              @for (o of entryOrders(); track o.orderId) {
                <option [value]="o.orderId">{{ orderLabel(o) }}</option>
              }
            </select>
            @if (entryFe.get('orderId'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field mt-3" [class.field-invalid]="entryFe.has('qty')">
            <label class="label">{{ 'quantity' | t }}</label>
            <input class="input" type="tel" inputmode="numeric" groupedNumber [(ngModel)]="entryQty" (ngModelChange)="entryFe.clear('qty')" [placeholder]="'operation_qty_placeholder' | t" />
            @if (entryFe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="quick mt-2">
            @for (n of quick; track n) {
              <button type="button" (click)="entryQty = n">{{ n }}</button>
            }
          </div>
          <div class="field mt-3">
            <label class="label">{{ 'defect_qty' | t }}</label>
            <input class="input" type="tel" inputmode="numeric" groupedNumber [(ngModel)]="entryDefect" [placeholder]="'defect_qty_placeholder' | t" />
          </div>
          <div class="field mt-3">
            <label class="label">{{ 'note' | t }}</label>
            <input class="input" [(ngModel)]="entryNote" [placeholder]="'note_optional' | t" />
          </div>
        } @else {
          <div class="tiny text-3">{{ 'ma_no_active_orders_msg' | t }}</div>
        }
        @if (entryError()) { <div class="err-text mt-3">{{ entryError() }}</div> }
        <div footer class="ma-modal-foot">
          <button class="btn" type="button" (click)="closeEntry()">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveEntry()" [disabled]="entryBusy()">
            @if (entryBusy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'save' | t }} }
          </button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .today { text-align: center; }
    .today-qty { font-size: 42px; font-weight: 700; letter-spacing: -.03em; line-height: 1.05; color: var(--primary-600); font-variant-numeric: tabular-nums; }
    .today-defect { font-size: 13px; padding: 6px 12px; border-radius: 999px; }
    .period-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .period { display: block; text-align: center; padding: 12px 8px !important; text-decoration: none; color: inherit; cursor: pointer; }
    .period:active { background: var(--surface-3); }
    .period-qty { font-size: 20px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .period-defect { margin-top: 6px; font-size: 11px; padding: 3px 8px; border-radius: 999px; }
    .quick { display: flex; gap: 6px; flex-wrap: wrap; }
    .quick button { flex: 1; min-width: 48px; padding: 8px 0; border: 1px solid var(--border-strong); border-radius: var(--r); background: var(--surface); cursor: pointer; font-size: 13px; }
  `],
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
      note: this.entryNote || this.i18n.t('ma_source_miniapp'),
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
