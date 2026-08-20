import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import type { Material, Paginated, StockOp, StockTransaction } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

type WhView = 'stock' | 'tx' | 'alerts';
const OPS: StockOp[] = ['IN', 'OUT', 'RESERVE', 'RETURN', 'INVENTORY'];

@Component({
  selector: 'app-ma-warehouse',
  standalone: true,
  imports: [
    FormsModule, IconComponent, StatusBadgeComponent, LoadingComponent, EmptyComponent,
    ModalComponent, TPipe, NumPipe, ShortDatePipe, GroupedNumberDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wh-head row-between mb-3">
      <div>
        <h2 style="font-size:17px;margin:0">{{ 'ma_wh_title' | t }}</h2>
        <div class="tiny text-3">{{ i18n.t('warehouse_positions_count', { n: data()?.total || 0 }) }}</div>
      </div>
      @if (ma.can('warehouse.create') && view() === 'stock') {
        <button class="btn btn-primary btn-sm" type="button" (click)="openMaterial({})">
          <ui-icon name="plus" [size]="15" />
        </button>
      }
    </div>

    <div class="kpi-grid mb-3">
      <div class="kpi card card-pad">
        <div class="tiny text-3">{{ 'total' | t }}</div>
        <div class="kpi-v">{{ data()?.total || 0 }}</div>
      </div>
      <div class="kpi card card-pad warn">
        <div class="tiny text-3">{{ 'st_LOW' | t }}</div>
        <div class="kpi-v">{{ lowCount() }}</div>
      </div>
      <div class="kpi card card-pad danger">
        <div class="tiny text-3">{{ 'st_OUT' | t }}</div>
        <div class="kpi-v">{{ outCount() }}</div>
      </div>
    </div>

    @if (view() === 'stock') {
      <div class="search-box mb-3">
        <ui-icon name="search" [size]="15" />
        <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
      </div>
      <div class="chips mb-3">
        @for (f of statusFilters; track f.value) {
          <button type="button" class="chip" [class.on]="status === f.value" (click)="setStatus(f.value)">{{ f.label | t }}</button>
        }
      </div>
    }

    @if (loading()) {
      <ui-loading [count]="5" [height]="68" />
    } @else if (view() === 'tx') {
      @if (transactions().length) {
        <div class="col gap-2">
          @for (t of transactions(); track t.id) {
            <div class="tx card card-pad">
              <div class="row-between mb-1">
                <span class="badge" [class]="opTone(t.op)">{{ 'op_' + t.op | t }}</span>
                <span class="tiny text-3">{{ t.createdAt | shortDate: true }}</span>
              </div>
              <div class="small bold">{{ t.material?.name }}</div>
              <div class="tiny text-3 mono mb-2">{{ t.material?.code }}</div>
              <div class="row-between">
                <span class="mono bold">{{ t.qty | num: 2 }} {{ t.material?.unit }}</span>
                <span class="tiny text-3">{{ 'balance' | t }}: {{ t.balance | num: 2 }}</span>
              </div>
              @if (t.note) { <div class="tiny text-3 mt-1">{{ t.note }}</div> }
            </div>
          }
        </div>
      } @else {
        <ui-empty icon="history" [title]="'no_data' | t" />
      }
    } @else if (view() === 'alerts') {
      @if (alertItems().length) {
        <div class="col gap-2">
          @for (m of alertItems(); track m.id) {
            <button class="mcard card card-pad" type="button" (click)="openOp(m)">
              <div class="row-between mb-1">
                <span class="mono small bold">{{ m.code }}</span>
                <ui-status [value]="m.status" />
              </div>
              <div class="small">{{ m.name }}</div>
              <div class="row-between mt-2">
                <span class="tiny text-3">{{ 'current_stock' | t }}</span>
                <span class="mono bold" [class.text-danger]="m.status === 'OUT'">{{ m.stock | num: 2 }} {{ m.unit }}</span>
              </div>
              <div class="row-between">
                <span class="tiny text-3">{{ 'min_stock' | t }}</span>
                <span class="tiny">{{ m.minStock | num: 2 }} {{ m.unit }}</span>
              </div>
            </button>
          }
        </div>
      } @else {
        <ui-empty icon="check-circle" [title]="'ma_wh_no_alerts' | t" />
      }
    } @else if (items().length) {
      <div class="col gap-2">
        @for (m of items(); track m.id) {
          <div class="mcard card card-pad">
            <div class="row-between mb-1">
              <span class="mono small bold">{{ m.code }}</span>
              <ui-status [value]="m.status" />
            </div>
            <div class="small mb-2">{{ m.name }}</div>
            <div class="row-between mb-2">
              <div>
                <div class="tiny text-3">{{ 'current_stock' | t }}</div>
                <div class="mono bold">{{ m.stock | num: 2 }} <span class="tiny text-3">{{ m.unit }}</span></div>
              </div>
              <div class="text-right">
                <div class="tiny text-3">{{ 'available' | t }}</div>
                <div class="mono">{{ m.available | num: 2 }}</div>
              </div>
            </div>
            @if (ma.can('warehouse.update')) {
              <button class="btn btn-primary btn-sm btn-block" type="button" (click)="openOp(m)">
                <ui-icon name="arrow-up-right" [size]="14" /> {{ 'stock_op' | t }}
              </button>
            }
          </div>
        }
      </div>
    } @else {
      <ui-empty icon="boxes" [title]="'no_data' | t" />
    }

    @if (opModal(); as m) {
      <ui-modal size="lg" [title]="'stock_op' | t" [subtitle]="m.name" (closed)="opModal.set(null)">
        <div class="ops mb-3">
          @for (o of ops; track o) {
            <button class="op" type="button" [class.on]="op.op === o" (click)="op.op = o">{{ 'op_' + o | t }}</button>
          }
        </div>
        <div class="field" [class.field-invalid]="opFe.has('qty')">
          <label class="label">{{ 'quantity' | t }} ({{ m.unit }})</label>
          <input class="input" style="height:44px;font-size:17px;text-align:center" groupedNumber [decimals]="3" [(ngModel)]="op.qty" (ngModelChange)="opFe.clear('qty')" />
          @if (opFe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>
        <div class="field mt-3">
          <label class="label">{{ 'note' | t }}</label>
          <input class="input" [(ngModel)]="op.note" [placeholder]="'note_optional' | t" />
        </div>
        <div footer class="ma-modal-foot">
          <button class="btn" type="button" (click)="opModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveOp(m)" [disabled]="busy()">
            @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'save' | t }} }
          </button>
        </div>
      </ui-modal>
    }

    @if (materialModal(); as m) {
      <ui-modal size="lg" [title]="m.id ? ('edit' | t) : ('new_material' | t)" (closed)="materialModal.set(null)">
        <div class="field" [class.field-invalid]="materialFe.has('code')">
          <label class="label">{{ 'code' | t }}</label>
          <input class="input mono" [(ngModel)]="form.code" (ngModelChange)="materialFe.clear('code')" />
          @if (materialFe.get('code'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>
        <div class="field mt-3" [class.field-invalid]="materialFe.has('name')">
          <label class="label">{{ 'material' | t }}</label>
          <input class="input" [(ngModel)]="form.name" (ngModelChange)="materialFe.clear('name')" />
          @if (materialFe.get('name'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>
        <div class="field mt-3"><label class="label">{{ 'category' | t }}</label><input class="input" [(ngModel)]="form.category" /></div>
        <div class="field mt-3"><label class="label">{{ 'unit' | t }}</label><input class="input" [(ngModel)]="form.unit" /></div>
        <div class="field mt-3"><label class="label">{{ 'min_stock' | t }}</label><input class="input" groupedNumber [decimals]="3" [(ngModel)]="form.minStock" /></div>
        <div class="field mt-3"><label class="label">{{ 'supplier' | t }}</label><input class="input" [(ngModel)]="form.supplier" /></div>
        @if (!m.id) {
          <div class="field mt-3"><label class="label">{{ 'initial_stock' | t }}</label><input class="input" groupedNumber [decimals]="3" [(ngModel)]="form.quantity" /></div>
        }
        <div footer class="ma-modal-foot">
          <button class="btn" type="button" (click)="materialModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveMaterial(m)" [disabled]="busy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .kpi { text-align: center; padding: 10px 6px !important; }
    .kpi-v { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
    .kpi.warn .kpi-v { color: var(--warning); }
    .kpi.danger .kpi-v { color: var(--danger); }
    .search-box { display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
    .search-box .input { border: 0; box-shadow: none; padding-left: 0; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { padding: 6px 12px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); font-size: 12px; cursor: pointer; }
    .chip.on { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
    .mcard { display: block; width: 100%; text-align: left; cursor: pointer; }
    .mcard:active { background: var(--surface-3); }
    .ops { display: flex; gap: 6px; flex-wrap: wrap; }
    .op { padding: 7px 12px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); cursor: pointer; font-size: 12px; }
    .op.on { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
    .ma-modal-foot { display: flex; gap: 8px; justify-content: flex-end; width: 100%; }
  `],
})
export class MaWarehouseComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly ops = OPS;
  readonly opFe = new FieldErrorsState();
  readonly materialFe = new FieldErrorsState();

  readonly statusFilters = [
    { value: '', label: 'all' },
    { value: 'OK', label: 'st_OK' },
    { value: 'LOW', label: 'st_LOW' },
    { value: 'OUT', label: 'st_OUT' },
  ] as const;

  search = '';
  status = '';
  readonly view = signal<WhView>('stock');
  readonly data = signal<Paginated<Material> | null>(null);
  readonly transactions = signal<StockTransaction[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly opModal = signal<Material | null>(null);
  readonly materialModal = signal<Partial<Material> | null>(null);

  op: { op: StockOp; qty: number | null; note: string } = { op: 'IN', qty: null, note: '' };
  form: Record<string, unknown> = {};
  private timer?: ReturnType<typeof setTimeout>;

  readonly items = computed(() => this.data()?.items ?? []);
  readonly lowCount = computed(() => this.items().filter((m) => m.status === 'LOW').length);
  readonly outCount = computed(() => this.items().filter((m) => m.status === 'OUT').length);
  readonly alertItems = computed(() =>
    this.items().filter((m) => m.status === 'LOW' || m.status === 'OUT').sort((a, b) => {
      if (a.status === b.status) return Number(a.stock) - Number(b.stock);
      return a.status === 'OUT' ? -1 : 1;
    }),
  );

  constructor() {
    this.syncView(this.router.url);
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.syncView(e.urlAfterRedirects);
      this.reload();
    });
    this.reload();
  }

  private syncView(url: string): void {
    if (url.includes('/warehouse/history')) this.view.set('tx');
    else if (url.includes('/warehouse/alerts')) this.view.set('alerts');
    else this.view.set('stock');
  }

  onSearch(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reload(), 320);
  }

  setStatus(v: string): void {
    this.status = v;
    this.reload();
  }

  reload(): void {
    const v = this.view();
    this.loading.set(true);
    if (v === 'tx') {
      this.api.get<Paginated<StockTransaction>>('/warehouse/transactions', { limit: 80 }).subscribe({
        next: (d) => { this.transactions.set(d.items); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
      return;
    }

    this.api.get<Paginated<Material>>('/warehouse', {
      page: 1, limit: 200,
      search: v === 'stock' ? this.search : undefined,
      status: v === 'stock' ? (this.status || undefined) : undefined,
    }).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        if (v === 'alerts' && !this.alertItems().length) this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openOp(m: Material): void {
    this.opFe.reset();
    this.op = { op: 'IN', qty: null, note: '' };
    this.opModal.set(m);
    haptic('success');
  }

  saveOp(m: Material): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as Record<string, string>);
    if (!this.opFe.apply(runValidation([
      { key: 'qty', label: t('quantity'), value: this.op.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('quantity') }) : null },
    ], t))) {
      haptic('error');
      return;
    }

    this.busy.set(true);
    this.api.post('/warehouse/operations', {
      materialId: m.id, op: this.op.op, qty: +this.op.qty!, note: this.op.note || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.opModal.set(null);
        this.toast.success(this.i18n.t('saved'));
        haptic('success');
        this.reload();
      },
      error: () => { this.busy.set(false); haptic('error'); },
    });
  }

  openMaterial(m: Partial<Material>): void {
    this.materialFe.reset();
    this.form = {
      code: m.code ?? '', name: m.name ?? '', category: m.category ?? '', unit: m.unit ?? 'dona',
      minStock: m.minStock ?? null, supplier: m.supplier ?? '', quantity: null,
    };
    this.materialModal.set(m);
  }

  saveMaterial(m: Partial<Material>): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as Record<string, string>);
    if (!this.materialFe.apply(runValidation([
      { key: 'code', label: t('code'), value: this.form['code'], required: true },
      { key: 'name', label: t('material'), value: this.form['name'], required: true },
    ], t))) {
      haptic('error');
      return;
    }

    this.busy.set(true);
    const body = { ...this.form };
    if (m.id) delete body['quantity'];
    const req = m.id
      ? this.api.patch(`/warehouse/${m.id}`, body)
      : this.api.post('/warehouse', body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.materialModal.set(null);
        this.toast.success(this.i18n.t('saved'));
        haptic('success');
        this.reload();
      },
      error: () => { this.busy.set(false); haptic('error'); },
    });
  }

  opTone(op: StockOp): string {
    return { IN: 'badge-success', OUT: 'badge-danger', RESERVE: 'badge-warning', RETURN: 'badge-info', INVENTORY: 'badge-neutral' }[op];
  }
}
