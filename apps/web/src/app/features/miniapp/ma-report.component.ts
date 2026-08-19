import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OrderStage, Paginated } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

/** The employee reports what they produced — the same transactional path the web uses. */
@Component({
  selector: 'app-ma-report',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, EmptyComponent, LoadingComponent, TPipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="mb-3" style="font-size:17px">{{ 'ma_orders' | t }}</h2>

    @if (!stageSlug()) {
      <ui-empty icon="alert-circle" [title]="'ma_no_dept' | t" [message]="'ma_no_dept_msg' | t" />
    } @else if (loading()) {
      <ui-loading [count]="4" [height]="76" />
    } @else if (!selected()) {
      <div class="small text-3 mb-3">{{ 'ma_select_order' | t }} — {{ 'stage_' + stageType() | t }}</div>
      <div class="col gap-3">
        @for (s of items(); track s.id) {
          <button class="ocard" type="button" (click)="select(s)">
            <div class="row-between mb-2">
              <b class="mono">{{ s.order?.number }}</b>
              <span class="badge badge-neutral">{{ s.order?.model?.code }}</span>
            </div>
            <ui-progress [value]="s.doneQty" [max]="s.planQty" />
          </button>
        } @empty {
          <ui-empty icon="clipboard-list" [title]="'ma_no_active_orders' | t" [message]="'ma_no_active_orders_msg' | t" />
        }
      </div>
    } @else {
      <div class="card card-pad">
        <div class="row-between mb-3">
          <div>
            <b class="mono">{{ selected()!.order?.number }}</b>
            <div class="tiny text-3">{{ 'stage_' + stageType() | t }} · {{ selected()!.order?.model?.code }}</div>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="selected.set(null)" [attr.data-tip]="'back' | t"><ui-icon name="x" [size]="16" /></button>
        </div>

        <ui-progress [value]="selected()!.doneQty" [max]="selected()!.planQty" />

        <div class="field mt-4" [class.field-invalid]="fe.has('qty')">
          <label class="label">{{ 'ma_enter_qty' | t }}</label>
          <input class="input" style="height:46px;font-size:18px;text-align:center" type="tel" inputmode="numeric" groupedNumber [(ngModel)]="qty" (ngModelChange)="fe.clear('qty')" [placeholder]="'operation_qty_placeholder' | t" />
          @if (fe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>

        <div class="quick mt-2">
          @for (n of quick; track n) { <button type="button" (click)="qty = n">{{ n }}</button> }
        </div>

        <div class="field mt-4">
          <label class="label">{{ 'defect_qty' | t }}</label>
          <input class="input" type="tel" inputmode="numeric" groupedNumber [(ngModel)]="defectQty" [placeholder]="'defect_qty_placeholder' | t" />
        </div>

        <div class="field mt-3">
          <label class="label">{{ 'note' | t }}</label>
          <input class="input" [(ngModel)]="note" [placeholder]="'note_optional' | t" />
        </div>

        @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }
        @if (ok()) { <div class="badge badge-success mt-3" style="width:100%;justify-content:center;padding:10px;border-radius:var(--r)"><ui-icon name="check-circle" [size]="15" /> {{ 'saved' | t }}</div> }

        <button class="btn btn-primary btn-lg btn-block mt-4" type="button" (click)="submit()" [disabled]="busy()">
          @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { <ui-icon name="send" [size]="16" /> {{ 'ma_send' | t }} }
        </button>
      </div>
    }
  `,
  styles: [`
    .ocard { display: block; width: 100%; text-align: left; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); cursor: pointer; }
    .ocard:active { background: var(--surface-3); }
    .quick { display: flex; gap: 6px; flex-wrap: wrap; }
    .quick button { flex: 1; min-width: 56px; padding: 9px 0; border: 1px solid var(--border-strong); border-radius: var(--r); background: var(--surface); cursor: pointer; font-size: 13px; }
    .quick button:active { background: var(--primary-50); }
  `],
})
export class MaReportComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly fe = new FieldErrorsState();

  readonly quick = [10, 25, 50, 100, 250];
  readonly items = signal<OrderStage[]>([]);
  readonly selected = signal<OrderStage | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly ok = signal(false);

  qty: number | null = null;
  defectQty: number | null = null;
  note = '';

  readonly stageType = computed(() => this.ma.user()?.department?.stage ?? null);
  readonly stageSlug = computed(() => this.stageType()?.toLowerCase() ?? '');

  constructor() {
    this.load();
    effect(() => {
      if (this.ma.productionTick() > 0) this.load();
    });
  }

  load(): void {
    const slug = this.stageSlug();
    if (!slug) { this.loading.set(false); return; }
    this.loading.set(true);
    this.api.get<Paginated<OrderStage>>(`/production/${slug}`, { limit: 50 }).subscribe({
      next: (d) => { this.items.set(d.items.filter((s) => s.status !== 'COMPLETED')); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  select(s: OrderStage): void {
    this.fe.reset();
    this.selected.set(s);
    this.qty = null;
    this.defectQty = null;
    this.note = '';
    this.error.set('');
    this.ok.set(false);
  }

  submit(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const s = this.selected();
    if (!s) return;
    if (!this.fe.apply(runValidation([
      { key: 'qty', label: t('ma_enter_qty'), value: this.qty, custom: (v) => isMissingQty(v) ? t('ma_enter_qty') : null },
    ], t))) {
      haptic('error');
      return;
    }

    this.busy.set(true);
    this.error.set('');

    this.api
      .post(`/production/${this.stageSlug()}/entries`, {
        orderId: s.order?.id ?? s.orderId,
        qty: +this.qty!,
        defectQty: +(this.defectQty || 0),
        date: new Date().toISOString(),
        note: this.note || this.i18n.t('ma_source_miniapp'),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.ok.set(true);
          haptic('success');
          this.ma.notifyProduction();
          setTimeout(() => { this.selected.set(null); this.load(); }, 1100);
        },
        error: (e) => {
          this.busy.set(false);
          haptic('error');
          const m = e?.error?.message;
          this.error.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
        },
      });
  }
}
