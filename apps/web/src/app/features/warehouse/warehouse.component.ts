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
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ConfirmComponent } from '../../shared/ui/confirm.component';

const OPS: StockOp[] = ['IN', 'OUT', 'RESERVE', 'RETURN', 'INVENTORY'];

@Component({
  selector: 'app-warehouse',
  templateUrl: './warehouse.component.html',
  styleUrl: './warehouse.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, NumPipe, ShortDatePipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  readonly archiving = signal<Material | null>(null);

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

  archive(m: Material): void {
    this.api.delete(`/warehouse/${m.id}`).subscribe({
      next: () => {
        this.archiving.set(null);
        this.toast.success(this.i18n.t('archived'));
        this.reload(false);
      },
      error: () => this.archiving.set(null),
    });
  }

  opTone(op: StockOp): string {
    return { IN: 'badge-success', OUT: 'badge-danger', RESERVE: 'badge-warning', RETURN: 'badge-info', INVENTORY: 'badge-neutral' }[op];
  }
}
