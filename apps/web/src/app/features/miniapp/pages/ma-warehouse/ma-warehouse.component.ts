import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import type { Material, Paginated, StockOp, StockTransaction } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { GroupedNumberDirective } from '../../../../shared/directives/grouped-number.directive';
import { NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../../../shared/utils/form-validate';
import { MiniAppService } from '../../services/miniapp.service';
import { haptic } from '../../utils/telegram';

type WhView = 'stock' | 'tx' | 'alerts';
const OPS: StockOp[] = ['IN', 'OUT', 'RESERVE', 'RETURN', 'INVENTORY'];

@Component({
  selector: 'app-ma-warehouse',
  templateUrl: './ma-warehouse.component.html',
  styleUrl: './ma-warehouse.component.scss',
  standalone: true,
  imports: [
    FormsModule, IconComponent, StatusBadgeComponent, LoadingComponent, EmptyComponent,
    ModalComponent, TPipe, NumPipe, ShortDatePipe, GroupedNumberDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
