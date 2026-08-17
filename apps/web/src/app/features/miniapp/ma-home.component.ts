import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OrderStage, Paginated, PlanModelBreakdown, PlanView } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { DigitsOnlyDirective } from '../../shared/directives/digits-only.directive';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

@Component({
  selector: 'app-ma-home',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, DigitsOnlyDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ma.user(); as u) {
      <div class="hero">
        <div class="row-between">
          <div>
            <div class="tiny" style="opacity:.75">{{ greeting() }}</div>
            <div style="font-size:17px;font-weight:600">{{ u.fullName }}</div>
            <div class="row gap-2 mt-1">
              <span class="badge badge-info tiny-badge">{{ u.role?.name }}</span>
            </div>
            <div class="tiny" style="opacity:.75">{{ u.department?.name || u.position }}</div>
          </div>
          <div class="hero-ic"><ui-icon [name]="stageIcon()" [size]="22" /></div>
        </div>
      </div>

      @if (loading()) { <ui-loading [count]="3" [height]="70" /> }
      @else {
        <div class="col gap-3 mt-4">
          @for (p of periods; track p.key) {
            <div
              class="card card-pad"
              [class.clickable]="p.key === 'DAILY'"
              (click)="p.key === 'DAILY' && openEntry()"
            >
              <div class="row-between mb-3">
                <b class="small">{{ p.label | t }}</b>
                <span class="badge badge-neutral">{{ plans()[p.key]?.producedQty || 0 | num }} / {{ plans()[p.key]?.targetQty || 0 | num }}</span>
              </div>
              <ui-progress [value]="plans()[p.key]?.producedQty || 0" [max]="plans()[p.key]?.targetQty || 1" [showLabel]="false" />
              <div class="row-between mt-3 tiny text-3">
                <span>{{ 'produced' | t }}: <b class="text-2">{{ plans()[p.key]?.producedQty || 0 | num }}</b> {{ 'pieces' | t }}</span>
                @if (p.key === 'DAILY') {
                  <span class="edit-hint"><ui-icon name="pencil" [size]="12" /> {{ 'ma_update_result' | t }}</span>
                }
              </div>
              @if (p.key === 'DAILY' && dailyLines().length) {
                <div class="model-breakdown mt-3">
                  <div class="tiny text-3 mb-2">{{ 'daily_by_model' | t }}</div>
                  @for (m of dailyLines(); track m.orderId + m.stage) {
                    <div class="model-row row-between">
                      <span class="tiny"><span class="mono">{{ m.orderNumber }}</span> · {{ m.modelCode }}</span>
                      <span class="tiny bold">{{ formatLine(m) }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    }

    @if (entryModal()) {
      <ui-modal [title]="'ma_update_result' | t" (closed)="closeEntry()">
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
            <input class="input" type="tel" inputmode="numeric" digitsOnly [(ngModel)]="entryQty" (ngModelChange)="entryFe.clear('qty')" [placeholder]="'operation_qty_placeholder' | t" />
            @if (entryFe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="quick mt-2">
            @for (n of quick; track n) {
              <button type="button" (click)="entryQty = n">{{ n }}</button>
            }
          </div>
          <div class="field mt-3">
            <label class="label">{{ 'defect_qty' | t }}</label>
            <input class="input" type="tel" inputmode="numeric" digitsOnly [(ngModel)]="entryDefect" [placeholder]="'defect_qty_placeholder' | t" />
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
    .hero { background: linear-gradient(135deg, #1b3a6b, #101828); color: #fff; border-radius: var(--r-xl); padding: 18px; }
    .hero-ic { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.13); display: flex; align-items: center; justify-content: center; }
    .clickable { cursor: pointer; transition: box-shadow .15s; }
    .clickable:active { box-shadow: var(--sh-2); }
    .edit-hint { display: inline-flex; align-items: center; gap: 4px; color: var(--primary-500); }
    .tiny-badge { font-size: 10px; padding: 2px 7px; }
    .model-breakdown { border-top: 1px solid var(--border); padding-top: 10px; }
    .model-row { padding: 4px 0; }
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

  readonly periods = [
    { key: 'DAILY', label: 'daily_plan' },
    { key: 'WEEKLY', label: 'weekly_plan' },
    { key: 'MONTHLY', label: 'monthly_plan' },
  ];
  readonly quick = [10, 25, 50, 100];
  readonly plans = signal<Record<string, PlanView>>({});
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
      this.ma.productionTick();
      if (this.ma.productionTick() > 0) this.reloadPlans();
    });
  }

  entryOrders(): PlanModelBreakdown[] {
    const assigned = this.dailyLines().filter((l) => l.targetQty && l.targetQty > 0);
    if (assigned.length) return assigned;
    if (this.dailyLines().length) return this.dailyLines();
    return this.fallbackOrders();
  }

  dailyLines(): PlanModelBreakdown[] {
    const daily = this.plans()['DAILY'];
    if (!daily) return [];
    if (daily.lines?.length) return daily.lines;
    return daily.byModel ?? [];
  }

  orderLabel(o: PlanModelBreakdown): string {
    const base = `${o.orderNumber} · ${o.modelCode}`;
    return o.targetQty ? `${base} — ${o.targetQty}` : base;
  }

  formatLine(m: PlanModelBreakdown): string {
    return m.targetQty ? `${m.qty} / ${m.targetQty}` : String(m.qty);
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
      if (!this.entryOrders().length) {
        this.toast.error(this.i18n.t('ma_no_active_orders_msg'));
      }
      haptic('error');
      return;
    }

    this.entryBusy.set(true);
    this.entryError.set('');
    this.api.post(`/production/${slug}/entries`, {
      orderId: this.entryOrderId,
      qty: +this.entryQty!,
      defectQty: +(this.entryDefect || 0),
      note: this.entryNote || this.i18n.t('ma_source_dashboard'),
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

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return this.i18n.t('greeting_morning');
    if (h < 18) return this.i18n.t('greeting_afternoon');
    return this.i18n.t('greeting_evening');
  }

  stageIcon(): string {
    const s = this.ma.user()?.department?.stage;
    return ({ CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets', LASER: 'zap', PACKING: 'package', LOADING: 'truck' } as Record<string, string>)[s ?? ''] ?? 'user';
  }
}
