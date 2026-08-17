import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Material, Paginated, StockOp, StockTransaction } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const OPS: StockOp[] = ['IN', 'OUT', 'RESERVE', 'RETURN', 'INVENTORY'];

@Component({
  selector: 'app-warehouse',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'warehouse_title' | t }}</div>
          <div class="sub">{{ i18n.t('warehouse_positions_count', { n: data()?.total || 0 }) }}</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm" type="button" (click)="tab.set(tab() === 'stock' ? 'tx' : 'stock')" [attr.data-tip]="tab() === 'stock' ? ('transactions' | t) : ('warehouse_title' | t)">
            <ui-icon name="history" [size]="15" /> {{ tab() === 'stock' ? ('transactions' | t) : ('warehouse_title' | t) }}
          </button>
          @if (auth.can('warehouse.create')) {
            <button class="btn btn-primary btn-sm" type="button" (click)="openMaterial({})" [attr.data-tip]="'new_material' | t"><ui-icon name="plus" [size]="15" /> {{ 'new_material' | t }}</button>
          }
        </div>
      </div>

      <div class="stats mb-6">
        <div class="stat"><div class="k">{{ 'total' | t }}</div><div class="v">{{ data()?.total || 0 }}</div></div>
        <div class="stat"><div class="k">{{ 'st_LOW' | t }}</div><div class="v" style="color:var(--warning)">{{ lowCount() }}</div></div>
        <div class="stat"><div class="k">{{ 'st_OUT' | t }}</div><div class="v" style="color:var(--danger)">{{ outCount() }}</div></div>
        <div class="stat"><div class="k">{{ 'reserved' | t }}</div><div class="v">{{ reservedCount() | num }}</div></div>
      </div>

      <div class="card">
        @if (tab() === 'stock') {
          <div class="toolbar">
            <div class="search-box">
              <ui-icon name="search" [size]="15" />
              <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
            </div>
            <select class="select" style="width:auto;min-width:150px" [(ngModel)]="category" (ngModelChange)="reload()">
              <option value="">{{ 'category' | t }}: {{ 'all' | t }}</option>
              @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
            <select class="select" style="width:auto;min-width:140px" [(ngModel)]="status" (ngModelChange)="reload()">
              <option value="">{{ 'status' | t }}: {{ 'all' | t }}</option>
              <option value="OK">{{ 'st_OK' | t }}</option>
              <option value="LOW">{{ 'st_LOW' | t }}</option>
              <option value="OUT">{{ 'st_OUT' | t }}</option>
            </select>
            <div class="grow"></div>
            <span class="tiny text-3 nowrap"><ui-icon name="info" [size]="13" /> {{ 'stock_note' | t }}</span>
          </div>

          @if (loading()) { <ui-loading /> }
          @else if (data(); as d) {
            @if (d.items.length) {
              <div class="table-wrap">
                <table class="data">
                  <thead><tr>
                    <th>{{ 'code' | t }}</th><th>{{ 'material' | t }}</th><th>{{ 'category' | t }}</th><th>{{ 'unit' | t }}</th>
                    <th class="num">{{ 'current_stock' | t }}</th><th class="num">{{ 'reserved' | t }}</th><th class="num">{{ 'available' | t }}</th>
                    <th class="num">{{ 'min_stock' | t }}</th><th>{{ 'supplier' | t }}</th><th>{{ 'status' | t }}</th><th class="actions"></th>
                  </tr></thead>
                  <tbody>
                    @for (m of d.items; track m.id) {
                      <tr>
                        <td class="mono small">{{ m.code }}</td>
                        <td>{{ m.name }}</td>
                        <td class="small">{{ m.category || '—' }}</td>
                        <td class="small">{{ m.unit }}</td>
                        <td class="num bold">{{ m.stock | num: 2 }}</td>
                        <td class="num">{{ m.reserved | num: 2 }}</td>
                        <td class="num">{{ m.available | num: 2 }}</td>
                        <td class="num text-3">{{ m.minStock | num: 2 }}</td>
                        <td class="small">{{ m.supplier || '—' }}</td>
                        <td><ui-status [value]="m.status" /></td>
                        <td class="actions">
                          @if (auth.can('warehouse.update')) {
                            <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="openOp(m)" [attr.data-tip]="'stock_op' | t"><ui-icon name="arrow-up-right" [size]="15" /></button>
                            <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="openMaterial(m)" [attr.data-tip]="'edit' | t"><ui-icon name="pencil" [size]="15" /></button>
                          }
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="showTx(m)" [attr.data-tip]="'history' | t"><ui-icon name="history" [size]="15" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <ui-pagination [page]="page()" [limit]="limit()" [total]="d.total" [totalPages]="d.pages"
                             (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); page.set(1); reload(false)" />
            } @else { <ui-empty icon="boxes" [title]="'no_data' | t" /> }
          }
        } @else {
          <div class="card-head"><h3>{{ 'transactions' | t }}</h3></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>{{ 'date' | t }}</th><th>{{ 'material' | t }}</th><th>{{ 'operation_type' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th class="num">{{ 'balance' | t }}</th><th>{{ 'order' | t }}</th><th>{{ 'who' | t }}</th><th>{{ 'note' | t }}</th></tr></thead>
              <tbody>
                @for (t of transactions(); track t.id) {
                  <tr>
                    <td class="small nowrap">{{ t.createdAt | shortDate: true }}</td>
                    <td><div class="small">{{ t.material?.name }}</div><div class="tiny text-3 mono">{{ t.material?.code }}</div></td>
                    <td><span class="badge" [class]="opTone(t.op)">{{ 'op_' + t.op | t }}</span></td>
                    <td class="num bold">{{ t.qty | num: 2 }} {{ t.material?.unit }}</td>
                    <td class="num">{{ t.balance | num: 2 }}</td>
                    <td class="small mono">{{ t.order?.number || '—' }}</td>
                    <td class="small">{{ t.user ? t.user.lastName + ' ' + t.user.firstName : '—' }}</td>
                    <td class="small text-3">{{ t.note || '—' }}</td>
                  </tr>
                } @empty { <tr><td colspan="8"><ui-empty icon="history" [title]="'no_data' | t" /></td></tr> }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    @if (opModal(); as m) {
      <ui-modal size="lg" [title]="'stock_op' | t" [subtitle]="m.name" (closed)="opModal.set(null)">
        <div class="ops mb-4">
          @for (o of ops; track o) {
            <button class="op" type="button" [class.on]="op.op === o" (click)="op.op = o">{{ 'op_' + o | t }}</button>
          }
        </div>
        <div class="form-grid">
          <div class="field" [class.field-invalid]="opFe.has('qty')">
            <label class="label">{{ 'quantity' | t }} ({{ m.unit }}) <span class="req">*</span></label>
            <input class="input" type="number" min="0" step="0.001" [(ngModel)]="op.qty" (ngModelChange)="opFe.clear('qty')" />
            @if (opFe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field">
            <label class="label">{{ 'current_stock' | t }}</label>
            <input class="input" [value]="m.stock + ' ' + m.unit" disabled />
          </div>
          <div class="field full"><label class="label">{{ 'note' | t }}</label><input class="input" [(ngModel)]="op.note" /></div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="opModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveOp(m)" [disabled]="busy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    @if (materialModal(); as m) {
      <ui-modal size="lg" [title]="m.id ? ('edit' | t) : ('new_material' | t)" (closed)="materialModal.set(null)">
        <div class="form-grid">
          <div class="field" [class.field-invalid]="materialFe.has('code')">
            <label class="label">{{ 'code' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="form.code" (ngModelChange)="materialFe.clear('code')" />
            @if (materialFe.get('code'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="materialFe.has('name')">
            <label class="label">{{ 'material' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="form.name" (ngModelChange)="materialFe.clear('name')" />
            @if (materialFe.get('name'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field"><label class="label">{{ 'category' | t }}</label><input class="input" [(ngModel)]="form.category" /></div>
          <div class="field"><label class="label">{{ 'unit' | t }}</label><input class="input" [(ngModel)]="form.unit" [placeholder]="'unit_placeholder' | t" /></div>
          <div class="field"><label class="label">{{ 'min_stock' | t }}</label><input class="input" type="number" [(ngModel)]="form.minStock" /></div>
          <div class="field"><label class="label">{{ 'price' | t }}</label><input class="input" type="number" [(ngModel)]="form.price" /></div>
          <div class="field full"><label class="label">{{ 'supplier' | t }}</label><input class="input" [(ngModel)]="form.supplier" /></div>
          @if (!m.id) {
            <div class="field full"><label class="label">{{ 'initial_stock' | t }}</label><input class="input" type="number" [(ngModel)]="form.quantity" /></div>
          }
        </div>
        <div footer>
          <button class="btn" type="button" (click)="materialModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveMaterial(m)" [disabled]="busy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .ops { display: flex; gap: 6px; flex-wrap: wrap; }
    .op { padding: 7px 13px; border: 1px solid var(--border-strong); border-radius: 100px; background: var(--surface); cursor: pointer; font-size: 13px; }
    .op.on { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
  `],
})
export class WarehouseComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly ops = OPS;
  search = ''; category = ''; status = '';
  readonly tab = signal<'stock' | 'tx'>('stock');
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<Material> | null>(null);
  readonly transactions = signal<StockTransaction[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly opModal = signal<Material | null>(null);
  readonly materialModal = signal<Partial<Material> | null>(null);

  readonly opFe = new FieldErrorsState();
  readonly materialFe = new FieldErrorsState();

  op: { op: StockOp; qty: number | null; note: string } = { op: 'IN', qty: null, note: '' };
  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;

  readonly categories = computed(() => [...new Set((this.data()?.items ?? []).map((m) => m.category).filter(Boolean))] as string[]);
  readonly lowCount = computed(() => (this.data()?.items ?? []).filter((m) => m.status === 'LOW').length);
  readonly outCount = computed(() => (this.data()?.items ?? []).filter((m) => m.status === 'OUT').length);
  readonly reservedCount = computed(() => (this.data()?.items ?? []).reduce((a, m) => a + m.reserved, 0));

  constructor() {
    const qp = new URLSearchParams(location.search);
    this.search = qp.get('search') ?? '';
    this.reload();
    this.loadTx();
  }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.api.get<Paginated<Material>>('/warehouse', {
      page: this.page(), limit: this.limit(), search: this.search, category: this.category, status: this.status,
    }).subscribe({
      next: (d) => { this.data.set(d); this.page.set(d.page); this.limit.set(d.limit); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadTx(materialId?: string): void {
    this.api.get<Paginated<StockTransaction>>('/warehouse/transactions', { materialId, limit: 100 }).subscribe({
      next: (d) => this.transactions.set(d.items), error: () => void 0,
    });
  }

  showTx(m: Material): void { this.loadTx(m.id); this.tab.set('tx'); }

  openOp(m: Material): void { this.opFe.reset(); this.op = { op: 'IN', qty: null, note: '' }; this.opModal.set(m); }

  saveOp(m: Material): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.opFe.apply(runValidation([
      { key: 'qty', label: t('quantity'), value: this.op.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('quantity') }) : null },
    ], t))) return;

    this.busy.set(true);
    this.api.post('/warehouse/operations', { materialId: m.id, op: this.op.op, qty: +this.op.qty!, note: this.op.note || undefined }).subscribe({
      next: () => {
        this.busy.set(false); this.opModal.set(null);
        this.toast.success(this.i18n.t('saved'));
        this.reload(false); this.loadTx();
      },
      error: () => this.busy.set(false),
    });
  }

  openMaterial(m: Partial<Material>): void {
    this.materialFe.reset();
    this.form = {
      code: m.code ?? '', name: m.name ?? '', category: m.category ?? '', unit: m.unit ?? '',
      minStock: m.minStock ?? null, price: m.price ?? null, supplier: m.supplier ?? '', quantity: null as number | null,
    };
    this.materialModal.set(m);
  }

  saveMaterial(m: Partial<Material>): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.materialFe.apply(runValidation([
      { key: 'code', label: t('code'), value: this.form['code'], required: true },
      { key: 'name', label: t('material'), value: this.form['name'], required: true },
    ], t))) return;

    this.busy.set(true);
    const body = { ...this.form };
    if (m.id) delete body['quantity'];
    if (body['price'] == null) delete body['price'];
    const req = m.id ? this.api.patch(`/warehouse/${m.id}`, body) : this.api.post('/warehouse', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.materialModal.set(null); this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: () => this.busy.set(false),
    });
  }

  opTone(op: StockOp): string {
    return { IN: 'badge-success', OUT: 'badge-danger', RESERVE: 'badge-warning', RETURN: 'badge-info', INVENTORY: 'badge-neutral' }[op];
  }
}
