import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OrderStage, Paginated, Shipment, StageEntry, StageStatus, StageType, User } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { ToastService } from '../../../../core/services/toast.service';
import { NumPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { DateInputComponent } from '../../../../shared/ui/date-input.component';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { PaginationComponent } from '../../../../shared/ui/pagination.component';
import { ProgressComponent } from '../../../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../../../shared/utils/form-validate';
import { DigitsOnlyDirective } from '../../../../shared/directives/digits-only.directive';
import { GroupedNumberDirective } from '../../../../shared/directives/grouped-number.directive';

const SLUG_TO_STAGE: Record<string, StageType> = {
  cutting: 'CUTTING', sewing: 'SEWING', washing: 'WASHING',
  laser: 'LASER', packing: 'PACKING', loading: 'LOADING',
};
const STAGE_ICON: Record<StageType, string> = {
  CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets',
  LASER: 'zap', PACKING: 'package', LOADING: 'truck',
};
const STATUSES: StageStatus[] = ['NOT_STARTED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'BLOCKED'];

/**
 * One component drives all six production modules. Stage-specific fields are
 * layered on top of the shared plan/actual/defect model.
 */
@Component({
  selector: 'app-production',
  templateUrl: './production.component.html',
  styleUrl: './production.component.scss',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PaginationComponent,
    EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, DateInputComponent, TPipe, NumPipe, ShortDatePipe,
    DigitsOnlyDirective, GroupedNumberDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly rt = inject(RealtimeService);

  readonly stage = input.required<string>();

  readonly statuses = STATUSES;
  readonly shipmentStatuses = ['READY', 'LOADING', 'LOADED', 'SHIPPED', 'COMPLETED'];

  search = '';
  status = '';
  assignId = '';

  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<OrderStage> | null>(null);
  readonly shipments = signal<Shipment[]>([]);
  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);

  readonly entryModal = signal<OrderStage | {} | null>(null);
  readonly defectModal = signal<OrderStage | null>(null);
  readonly detail = signal<OrderStage | null>(null);
  readonly cancelling = signal<StageEntry | null>(null);
  readonly shipmentModal = signal<Partial<Shipment> | null>(null);
  readonly entryError = signal('');

  readonly entryFe = new FieldErrorsState();
  readonly defectFe = new FieldErrorsState();
  readonly shipmentFe = new FieldErrorsState();
  readonly assignFe = new FieldErrorsState();

  entry = { orderId: '', qty: null as number | null, defectQty: null as number | null, date: '', note: '', meta: {} as Record<string, unknown> };
  defect = { type: '', qty: null as number | null, reason: '', comment: '' };
  shipment: Partial<Shipment> & { orderId?: string; status?: string } = {};

  readonly stageType = computed<StageType>(() => SLUG_TO_STAGE[this.stage()?.toLowerCase()] ?? 'CUTTING');
  readonly icon = computed(() => STAGE_ICON[this.stageType()]);
  readonly isLoading = computed(() => this.stageType() === 'LOADING');
  readonly isCutting = computed(() => this.stageType() === 'CUTTING');
  readonly isPacking = computed(() => this.stageType() === 'PACKING');
  readonly canWrite = computed(() => this.auth.can(`${this.stage().toLowerCase()}.create`, `${this.stage().toLowerCase()}.update`));
  readonly canAssignUsers = computed(() => this.auth.can('users.read'));
  readonly openStages = computed(() => (this.data()?.items ?? []).filter((s) => s.status !== 'COMPLETED'));

  readonly sum = computed(() => {
    const items = this.data()?.items ?? [];
    const plan = items.reduce((a, s) => a + s.planQty, 0);
    const done = items.reduce((a, s) => a + s.doneQty, 0);
    const defect = items.reduce((a, s) => a + s.defectQty, 0);
    const progress = plan ? Math.round((done / plan) * 100) : 0;
    return { plan, done, defect, remaining: Math.max(0, plan - done), progress };
  });

  private searchTimer?: ReturnType<typeof setTimeout>;
  private rtTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => { this.stage(); this.reload(); });
    effect(() => {
      this.rt.tick();
      if (!this.data()) return;
      clearTimeout(this.rtTimer);
      this.rtTimer = setTimeout(() => this.reload(false, true), 500);
    });

    if (this.auth.can('users.read')) {
      this.api.get<{ items: User[] }>('/users', { limit: 100 }).subscribe({
        next: (r) => this.users.set(r.items), error: () => void 0,
      });
    }
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 320);
  }

  reload(resetPage = true, silent = false): void {
    if (resetPage) this.page.set(1);
    if (!silent) this.loading.set(true);
    this.api
      .get<Paginated<OrderStage>>(`/production/${this.stage().toLowerCase()}`, {
        page: this.page(), limit: this.limit(), search: this.search, status: this.status,
      })
      .subscribe({
        next: (d) => { this.data.set(d); this.page.set(d.page); this.limit.set(d.limit); this.loading.set(false); },
        error: () => this.loading.set(false),
      });

    if (this.isLoading()) {
      this.api.get<Shipment[]>('/production/shipments').subscribe({
        next: (s) => this.shipments.set(s), error: () => void 0,
      });
    }
  }

  openEntry(s?: OrderStage): void {
    this.entryFe.reset();
    this.entry = {
      orderId: s?.order?.id ?? '', qty: null, defectQty: null,
      date: this.todayLocal(), note: '', meta: {},
    };
    this.entryError.set('');
    this.entryModal.set(s ?? {});
  }

  private todayLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  saveEntry(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.entryFe.apply(runValidation([
      { key: 'orderId', label: t('order'), value: this.entry.orderId, required: true },
      { key: 'qty', label: t('operation_qty'), value: this.entry.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('operation_qty') }) : null },
      { key: 'date', label: t('date'), value: this.entry.date, required: true },
    ], t))) return;

    this.busy.set(true);
    this.entryError.set('');
    const meta = Object.fromEntries(Object.entries(this.entry.meta).filter(([, v]) => v !== '' && v != null));
    this.api
      .post(`/production/${this.stage().toLowerCase()}/entries`, {
        orderId: this.entry.orderId,
        qty: +this.entry.qty!,
        defectQty: +(this.entry.defectQty || 0),
        date: new Date(this.entry.date).toISOString(),
        note: this.isPacking() ? (this.entry.note || undefined) : undefined,
        meta: Object.keys(meta).length ? meta : undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.entryModal.set(null);
          this.toast.success(this.i18n.t('saved'));
          this.reload(false);
          const open = this.detail();
          if (open && (open.order?.id ?? open.orderId) === this.entry.orderId) this.openDetail(open);
        },
        error: (e) => {
          this.busy.set(false);
          const m = e?.error?.message;
          this.entryError.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
        },
      });
  }

  openDefect(s: OrderStage): void {
    this.defectFe.reset();
    this.defect = { type: '', qty: null, reason: '', comment: '' };
    this.defectModal.set(s);
  }

  saveDefect(s: OrderStage): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.defectFe.apply(runValidation([
      { key: 'type', label: t('defect_type'), value: this.defect.type, required: true },
      { key: 'qty', label: t('quantity'), value: this.defect.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('quantity') }) : null },
    ], t))) return;

    this.busy.set(true);
    this.api
      .post('/production/defects', {
        orderId: s.order?.id ?? s.orderId,
        stage: this.stageType(),
        type: this.defect.type,
        qty: +this.defect.qty!,
        reason: this.defect.reason || undefined,
        comment: this.defect.comment || undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.defectModal.set(null);
          this.toast.success(this.i18n.t('saved'));
          this.reload(false);
        },
        error: () => this.busy.set(false),
      });
  }

  openDetail(s: OrderStage): void {
    this.assignFe.reset();
    this.assignId = s.responsible?.id ?? '';
    this.detail.set({ ...s, entries: s.entries ?? [] });
    this.api.get<OrderStage & { entries?: StageEntry[] }>(`/production/${this.stage().toLowerCase()}/${s.order?.id ?? s.orderId}`).subscribe({
      next: (d) => this.detail.set(d),
      error: () => this.toast.error(this.i18n.t('error')),
    });
  }

  detailSubtitle(s: OrderStage): string {
    const stage = this.i18n.t('stage_' + this.stageType());
    const model = s.order?.model?.code;
    return model ? `${stage} · ${model}` : stage;
  }

  assign(s: OrderStage): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.assignFe.apply(runValidation([
      { key: 'assignId', label: t('responsible'), value: this.assignId, required: true },
    ], t))) return;

    this.api.patch(`/production/stages/${s.id}`, { responsibleId: this.assignId }).subscribe({
      next: () => { this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: () => void 0,
    });
  }

  cancelEntry(e: StageEntry): void {
    this.api.post(`/production/entries/${e.id}/cancel`).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.detail.set(null);
        this.toast.success(this.i18n.t('saved'));
        this.reload(false);
      },
      error: () => this.cancelling.set(null),
    });
  }

  openShipmentModal(sh: Partial<Shipment> = {}): void {
    this.shipmentFe.reset();
    this.shipment = {
      orderId: sh.order?.id ?? sh.orderId ?? '',
      vehicle: sh.vehicle ?? '',
      driver: sh.driver ?? '',
      driverPhone: sh.driverPhone ?? '',
      qty: sh.qty ?? undefined,
      boxCount: sh.boxCount ?? undefined,
      loadingDate: sh.loadingDate ? sh.loadingDate.slice(0, 10) : '',
      trackNo: sh.trackNo ?? '',
      status: sh.status ?? undefined,
    };
    this.shipmentModal.set(sh);
  }

  saveShipment(sh: Partial<Shipment>): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.shipmentFe.apply(runValidation([
      { key: 'orderId', label: t('order'), value: this.shipment.orderId, required: true },
    ], t))) return;

    this.busy.set(true);
    const body = {
      ...this.shipment,
      loadingDate: this.shipment.loadingDate ? new Date(this.shipment.loadingDate).toISOString() : new Date().toISOString(),
      qty: this.shipment.qty != null ? +this.shipment.qty : 0,
      boxCount: this.shipment.boxCount != null ? +this.shipment.boxCount : 0,
      status: (this.shipment.status || 'READY') as Shipment['status'],
    };
    const req = sh.id ? this.api.patch(`/production/shipments/${sh.id}`, body) : this.api.post('/production/shipments', body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.shipmentModal.set(null);
        this.shipment = {};
        this.toast.success(this.i18n.t('saved'));
        this.reload(false);
      },
      error: () => this.busy.set(false),
    });
  }

  workerNick(raw?: string | null): string | null {
    const trimmed = raw?.trim();
    if (!trimmed) return null;
    const handle = trimmed.replace(/^@+/, '');
    return handle ? `@${handle}` : null;
  }

  isTelegramSource(source: string): boolean {
    return source === 'TELEGRAM' || source === 'MINIAPP';
  }

  sourceLabel(source: string): string {
    if (this.isTelegramSource(source)) return this.i18n.t('source_telegram');
    if (source === 'WEB') return this.i18n.t('source_web');
    return source;
  }

  /** Hide auto-filled miniapp placeholder notes in the operations table. */
  entryNote(raw?: string | null): string {
    const note = raw?.trim();
    if (!note) return '—';
    const auto = this.i18n.t('ma_source_miniapp');
    if (note === auto) return '—';
    return note;
  }
}
