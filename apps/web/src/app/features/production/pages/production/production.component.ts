import { concat, toArray } from 'rxjs';
import { isTopAdmin } from '../../../../core/utils/role.util';
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
  readonly completing = signal<OrderStage | null>(null);
  readonly deletingOrder = signal<OrderStage | null>(null);
  /** "Tahrirlash" — correct this stage's totals / responsible. */
  readonly editing = signal<OrderStage | null>(null);
  editForm = { doneQty: 0 as number | null, defectQty: 0 as number | null, responsibleId: '' };
  readonly deletingEntry = signal<StageEntry | null>(null);
  /** Operation row being edited (pencil in the operations list). */
  readonly editingEntry = signal<StageEntry | null>(null);
  entryEdit = { qty: 0 as number | null, defectQty: 0 as number | null, finishedAt: '', note: '' };
  /** Upakovka inner steps, in working order. */
  readonly packStepKeys = ['CLEANING', 'IRONING', 'ACCESSORIES', 'SCANNING', 'BOXING'];
  /** Deleting single operation rows — Super Admin / Super Pro Admin. */
  readonly canDeleteEntries = computed(() => isTopAdmin(this.auth.user()));
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
  /** Permanent order delete from this stage page — <stage>.purge or orders.purge, set per role. */
  readonly canPurge = computed(() => this.auth.can(`${this.stage().toLowerCase()}.purge`, 'orders.purge'));
  /** Orders offered in "Operatsiyani yangilash": open ones, plus the row it was opened from. */
  readonly openStages = computed(() => {
    const from = this.entryModal() as OrderStage | null;
    return (this.data()?.items ?? []).filter((s) => s.status !== 'COMPLETED' || (from && 'id' in from && from.id === s.id));
  });

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

  /** Now, as the date-time input expects it (local "YYYY-MM-DDTHH:mm"). */
  private todayLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  saveEntry(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.entryFe.apply(runValidation([
      { key: 'orderId', label: t('order'), value: this.entry.orderId, required: true },
      { key: 'qty', label: t('operation_qty'), value: this.entry.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('operation_qty') }) : null },
      { key: 'date', label: t('work_finished_at'), value: this.entry.date, required: true },
      ...(this.isPacking()
        ? [{ key: 'subStage', label: t('sub_stage'), value: this.entry.meta['subStage'] as string, required: true }]
        : []),
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
        finishedAt: new Date(this.entry.date).toISOString(),
        note: this.entry.note?.trim() || undefined,
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

  openEdit(s: OrderStage): void {
    this.editForm = { doneQty: s.doneQty, defectQty: s.defectQty, responsibleId: s.responsible?.id ?? '' };
    this.editing.set(s);
  }

  saveEdit(): void {
    const s = this.editing();
    if (!s) return;
    const done = Math.max(0, Math.floor(+(this.editForm.doneQty ?? 0)));
    const defect = Math.max(0, Math.floor(+(this.editForm.defectQty ?? 0)));
    const calls = [];
    if ((this.editForm.responsibleId || '') !== (s.responsible?.id ?? '') && this.editForm.responsibleId) {
      calls.push(this.api.patch(`/production/stages/${s.id}`, { responsibleId: this.editForm.responsibleId }));
    }
    if (done !== s.doneQty || defect !== s.defectQty) {
      calls.push(this.api.patch(`/production/stages/${s.id}/correct`, { doneQty: done, defectQty: defect }));
    }
    if (!calls.length) { this.editing.set(null); return; }
    this.busy.set(true);
    concat(...calls).pipe(toArray()).subscribe({
      next: () => {
        this.busy.set(false);
        this.editing.set(null);
        this.toast.success(this.i18n.t('saved'));
        this.reload(false);
      },
      error: () => this.busy.set(false),
    });
  }

  /** Real operation rows only — not cancelled ones or their reversal rows. */
  isEditableEntry(e: StageEntry): boolean {
    return !e.cancelled && !(e.note ?? '').startsWith('Reversal of ');
  }

  openEntryEdit(e: StageEntry): void {
    const d = new Date(e.date);
    const pad = (n: number) => String(n).padStart(2, '0');
    const note = (e.note ?? '').trim();
    const system = note === 'Correction' || note === this.i18n.t('ma_source_miniapp');
    this.entryEdit = {
      qty: e.qty,
      defectQty: e.defectQty,
      finishedAt: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      note: system ? '' : note,
    };
    this.editingEntry.set(e);
  }

  saveEntryEdit(): void {
    const e = this.editingEntry();
    if (!e) return;
    const qty = Math.max(0, Math.floor(+(this.entryEdit.qty ?? 0)));
    const defectQty = Math.max(0, Math.floor(+(this.entryEdit.defectQty ?? 0)));
    if (qty <= 0 && defectQty <= 0) { this.toast.error(this.i18n.t('ma_enter_qty')); return; }
    const when = this.entryEdit.finishedAt ? new Date(this.entryEdit.finishedAt) : null;
    this.busy.set(true);
    this.api.patch(`/production/entries/${e.id}`, {
      qty,
      defectQty,
      note: this.entryEdit.note ?? '',
      ...(when && !Number.isNaN(+when) ? { finishedAt: when.toISOString() } : {}),
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingEntry.set(null);
        this.toast.success(this.i18n.t('saved'));
        const d = this.detail();
        if (d) this.openDetail(d);
        this.reload(false);
      },
      error: () => this.busy.set(false),
    });
  }

  entryDeleteMessage(e: StageEntry): string {
    const d = new Date(e.date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return this.i18n.t('entry_delete_confirm', { date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, qty: e.qty });
  }

  deleteEntry(e: StageEntry): void {
    this.api.delete(`/production/entries/${e.id}`).subscribe({
      next: () => {
        this.deletingEntry.set(null);
        this.toast.success(this.i18n.t('deleted'));
        const d = this.detail();
        if (d) this.openDetail(d);
        this.reload(false);
      },
      error: () => this.deletingEntry.set(null),
    });
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

  /**
   * Closes a stage by hand. Cutting never closes itself, and any stage may have
   * to be closed short of plan — fabric ran out, the rest was scrapped.
   */
  completeStage(s: OrderStage): void {
    this.completing.set(null);
    this.api.patch(`/production/stages/${s.id}`, { status: 'COMPLETED' }).subscribe({
      next: () => { this.toast.success(this.i18n.t('stage_completed_ok')); this.reload(false); },
      error: () => void 0,
    });
  }

  /** Pieces still missing against the plan, so the confirm can state the cost. */
  stageLeft(s: OrderStage): number {
    return Math.max(0, s.planQty - s.doneQty);
  }

  completeMessage(s: OrderStage): string {
    return this.i18n.t('stage_complete_confirm', {
      order: s.order?.number ?? '',
      stage: this.i18n.t(`stage_${this.stageType()}`),
      done: s.doneQty,
      plan: s.planQty,
    });
  }

  /** Spells out what closing costs: locked downstream plan, or unrecorded pieces. */
  completeNote(s: OrderStage): string {
    if (this.isCutting()) return this.i18n.t('stage_complete_note_cutting', { done: s.doneQty });
    const over = s.doneQty - s.planQty;
    return over > 0
      ? this.i18n.t('stage_complete_note_over', { over })
      : this.i18n.t('stage_complete_note', { left: this.stageLeft(s) });
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
    // System notes (bot marker, corrections, reversals) are not comments.
    if (note === auto || note === 'Correction' || note.startsWith('Reversal of ')) return '—';
    return note;
  }

  deleteOrder(s: OrderStage): void {
    const orderId = s.order?.id ?? s.orderId;
    const number = s.order?.number ?? '';
    this.api.delete(`/archive/order/${orderId}?stage=${this.stage().toLowerCase()}`).subscribe({
      next: () => { this.deletingOrder.set(null); this.toast.success(this.i18n.t('deleted'), number); this.reload(false); },
      error: () => this.deletingOrder.set(null),
    });
  }
}
