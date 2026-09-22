import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Material, Paginated, StockOp, StockTransaction } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../../../shared/utils/form-validate';
import { GroupedNumberDirective } from '../../../../shared/directives/grouped-number.directive';
import { PaginationComponent } from '../../../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { DateInputComponent } from '../../../../shared/ui/date-input.component';

const OPS: StockOp[] = ['IN', 'OUT', 'RESERVE', 'RETURN', 'INVENTORY'];

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Component({
  selector: 'app-warehouse',
  templateUrl: './warehouse.component.html',
  styleUrl: './warehouse.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, DateInputComponent, TPipe, NumPipe, ShortDatePipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly ops = OPS;
  search = ''; category = ''; status = ''; asOfDate = '';
  txFrom = ''; txTo = '';
  readonly tab = signal<'stock' | 'tx'>('stock');
  readonly txMaterial = signal<Material | null>(null);
  readonly snapshotAsOf = signal<string | null>(null);
  readonly txViewKey = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<Material> | null>(null);
  readonly transactions = signal<StockTransaction[]>([]);
  readonly loading = signal(false);
  readonly txLoading = signal(false);
  readonly busy = signal(false);
  readonly opModal = signal<Material | null>(null);
  readonly bulkOpOpen = signal(false);
  readonly bulkArchiveOpen = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly materialModal = signal<Partial<Material> | null>(null);
  readonly archiving = signal<Material | null>(null);
  readonly txEditing = signal<StockTransaction | null>(null);
  readonly txDeleting = signal<StockTransaction | null>(null);

  readonly opFe = new FieldErrorsState();
  readonly materialFe = new FieldErrorsState();
  readonly txFe = new FieldErrorsState();

  readonly canManage = computed(() => this.auth.can('warehouse.update'));

  op: { op: StockOp; qty: number | null; note: string } = { op: 'IN', qty: null, note: '' };
  txForm: { qty: number | null; note: string } = { qty: null, note: '' };
  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;

  readonly categories = computed(() => [...new Set((this.data()?.items ?? []).map((m) => m.category).filter(Boolean))] as string[]);
  readonly historicalView = computed(() => {
    const d = this.asOfDate.trim();
    return !!d && d !== isoDate(new Date());
  });
  readonly lowCount = computed(() => (this.data()?.items ?? []).filter((m) => m.status === 'LOW').length);
  readonly outCount = computed(() => (this.data()?.items ?? []).filter((m) => m.status === 'OUT').length);
  readonly reservedCount = computed(() => (this.data()?.items ?? []).reduce((a, m) => a + m.reserved, 0));
  readonly selectedIds = computed(() => [...this.selected()]);
  readonly bulkTargetCount = computed(() => (this.selected().size >= 2 ? this.selected().size : 0));
  /** Edit / history — faqat bitta qator rejimida (2+ tanlovda tanlangan qatorlarda yashirin). */
  canSingleRowUi(m: Material): boolean {
    const sel = this.selected();
    return sel.size < 2 || !sel.has(m.id);
  }
  readonly bulkTargetsOnPage = computed(() => {
    const ids = new Set(this.bulkTargetIds());
    return (this.data()?.items ?? []).filter((m) => ids.has(m.id));
  });
  readonly bulkTargetsOffPageCount = computed(() => {
    const ids = this.bulkTargetIds();
    const onPage = new Set(this.bulkTargetsOnPage().map((m) => m.id));
    return ids.filter((id) => !onPage.has(id)).length;
  });

  constructor() {
    const qp = new URLSearchParams(location.search);
    this.search = qp.get('search') ?? '';
    this.reload();
  }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    const params: Record<string, string | number> = {
      page: this.page(), limit: this.limit(), search: this.search, category: this.category, status: this.status,
    };
    const asOf = this.asOfDate.trim();
    if (asOf && asOf !== isoDate(new Date())) params['asOf'] = asOf;

    this.api.get<Paginated<Material> & { asOf?: string }>('/warehouse', params).subscribe({
      next: (d) => {
        this.data.set(d);
        this.page.set(d.page);
        this.limit.set(d.limit);
        this.snapshotAsOf.set(d.asOf ?? (asOf && asOf !== isoDate(new Date()) ? asOf : null));
        this.loading.set(false);
        this.selected.update((s) => {
          const ids = new Set(d.items.map((m) => m.id));
          return new Set([...s].filter((id) => ids.has(id)));
        });
      },
      error: () => this.loading.set(false),
    });
  }

  onAsOfChange(): void { this.reload(); }

  clearAsOf(): void {
    this.asOfDate = '';
    this.snapshotAsOf.set(null);
    this.reload();
  }

  loadTx(materialId?: string): void {
    const mid = materialId ?? this.txMaterial()?.id;
    const viewKey = mid ?? 'all';
    this.txViewKey.set(viewKey);
    this.txLoading.set(true);
    this.transactions.set([]);

    const params: Record<string, string | number> = { materialId: mid ?? '', limit: 100 };
    if (this.txFrom) params['from'] = this.txFrom;
    if (this.txTo) params['to'] = this.txTo;
    if (!mid) delete params['materialId'];

    this.api.get<Paginated<StockTransaction>>('/warehouse/transactions', params).subscribe({
      next: (d) => {
        if (this.txViewKey() !== viewKey) return;
        this.transactions.set(d.items);
        this.txLoading.set(false);
      },
      error: () => {
        if (this.txViewKey() === viewKey) this.txLoading.set(false);
      },
    });
  }

  onTxDateChange(): void { this.loadTx(); }

  clearTxDates(): void {
    this.txFrom = '';
    this.txTo = '';
    this.loadTx();
  }

  showTx(m: Material): void {
    this.transactions.set([]);
    this.txLoading.set(true);
    this.txMaterial.set(m);
    this.tab.set('tx');
    this.loadTx(m.id);
  }

  openAllTx(): void {
    this.transactions.set([]);
    this.txLoading.set(true);
    this.txMaterial.set(null);
    this.tab.set('tx');
    this.loadTx();
  }

  backToStock(): void {
    this.txMaterial.set(null);
    this.txViewKey.set(null);
    this.transactions.set([]);
    this.tab.set('stock');
  }

  /** Row action targets: 2+ checked including this row → all selected; otherwise only this row. */
  private actionTargetIds(m: Material): string[] {
    const sel = this.selected();
    if (sel.size >= 2 && sel.has(m.id)) return [...sel];
    return [m.id];
  }

  openOp(m: Material): void {
    this.opFe.reset();
    this.op = { op: 'IN', qty: null, note: '' };
    if (this.actionTargetIds(m).length >= 2) {
      this.bulkOpOpen.set(true);
      return;
    }
    this.opModal.set(m);
  }

  openArchive(m: Material): void {
    if (this.actionTargetIds(m).length >= 2) {
      this.bulkArchiveOpen.set(true);
      return;
    }
    this.archiving.set(m);
  }

  toggleSelect(id: string, on: boolean): void {
    this.selected.update((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  allPageSelected(items: Material[]): boolean {
    return items.length > 0 && items.every((m) => this.selected().has(m.id));
  }

  toggleSelectAll(items: Material[], on: boolean): void {
    this.selected.update((s) => {
      const n = new Set(s);
      for (const m of items) {
        if (on) n.add(m.id); else n.delete(m.id);
      }
      return n;
    });
  }

  clearSelection(): void { this.selected.set(new Set()); }

  saveBulkOp(): void {
    if (this.busy()) return;
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const ids = this.bulkTargetIds();
    if (!ids.length) return;
    if (!this.opFe.apply(runValidation([
      { key: 'qty', label: t('quantity'), value: this.op.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('quantity') }) : null },
    ], t))) return;

    this.busy.set(true);
    this.api.post<{ updated: number; errors: { materialId: string; code: string }[] }>(
      '/warehouse/operations/bulk',
      { materialIds: ids, op: this.op.op, qty: +this.op.qty!, note: this.op.note || undefined },
    ).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.bulkOpOpen.set(false);
        this.clearSelection();
        if (res.errors?.length) {
          this.toast.info(t('bulk_partial_ok', { ok: res.updated, fail: res.errors.length }));
        } else {
          this.toast.success(t('saved'));
        }
        this.reload(false);
      },
      error: () => this.busy.set(false),
    });
  }

  /** Ids for bulk modals opened from a row action (2+ selected including that row). */
  bulkTargetIds(): string[] {
    const sel = this.selected();
    return sel.size >= 2 ? [...sel] : [];
  }

  confirmBulkArchive(): void {
    if (this.busy()) return;
    const ids = this.bulkTargetIds();
    if (!ids.length) return;
    this.busy.set(true);
    this.api.post<{ archived: number; errors: { materialId: string }[] }>('/warehouse/archive/bulk', { materialIds: ids }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.bulkArchiveOpen.set(false);
        const removed = new Set(ids);
        this.data.update((d) => {
          if (!d) return d;
          const items = d.items.filter((m) => !removed.has(m.id));
          return { ...d, items, total: Math.max(0, d.total - res.archived) };
        });
        this.clearSelection();
        if (res.errors?.length) {
          this.toast.info(this.i18n.t('bulk_partial_ok', { ok: res.archived, fail: res.errors.length }));
        } else {
          this.toast.success(this.i18n.t('archived'));
        }
        this.reload(false);
      },
      error: () => this.busy.set(false),
    });
  }

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
    if (this.busy()) return;
    this.busy.set(true);
    this.api.delete(`/warehouse/${m.id}`).subscribe({
      next: () => {
        this.busy.set(false);
        this.archiving.set(null);
        this.data.update((d) => d ? { ...d, items: d.items.filter((x) => x.id !== m.id), total: Math.max(0, d.total - 1) } : d);
        this.selected.update((s) => { const n = new Set(s); n.delete(m.id); return n; });
        this.toast.success(this.i18n.t('archived'));
        this.reload(false);
      },
      error: () => { this.busy.set(false); this.archiving.set(null); },
    });
  }

  openTxEdit(t: StockTransaction): void {
    this.txFe.reset();
    this.txForm = { qty: t.qty, note: t.note ?? '' };
    this.txEditing.set(t);
  }

  saveTxEdit(t: StockTransaction): void {
    const label = this.i18n.t('quantity');
    if (!this.txFe.apply(runValidation([
      { key: 'qty', label, value: this.txForm.qty, custom: (v) => isMissingQty(v) ? this.i18n.t('field_required', { field: label }) : null },
    ], (k, p) => this.i18n.t(k, p as any)))) return;

    this.busy.set(true);
    this.api.patch<StockTransaction>(`/warehouse/transactions/${t.id}`, {
      qty: +this.txForm.qty!,
      note: this.txForm.note || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.txEditing.set(null);
        this.toast.success(this.i18n.t('saved'));
        this.reload(false);
        this.loadTx();
      },
      error: () => this.busy.set(false),
    });
  }

  deleteTx(t: StockTransaction): void {
    this.busy.set(true);
    this.api.delete(`/warehouse/transactions/${t.id}`).subscribe({
      next: () => {
        this.busy.set(false);
        this.txDeleting.set(null);
        this.toast.success(this.i18n.t('deleted'));
        this.reload(false);
        this.loadTx();
      },
      error: () => { this.busy.set(false); this.txDeleting.set(null); },
    });
  }

  txLabel(t: StockTransaction): string {
    const mat = t.material?.name || t.material?.code || '—';
    return `${this.i18n.t('op_' + t.op)} · ${mat} · ${t.qty}`;
  }

  opTone(op: StockOp): string {
    return { IN: 'badge-success', OUT: 'badge-danger', RESERVE: 'badge-warning', RETURN: 'badge-info', INVENTORY: 'badge-neutral' }[op];
  }
}
