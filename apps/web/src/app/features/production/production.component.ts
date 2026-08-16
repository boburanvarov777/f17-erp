import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OrderStage, Paginated, Shipment, StageEntry, StageStatus, StageType, User } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../shared/ui/confirm.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

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
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PaginationComponent,
    EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, NumPipe, ShortDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="row gap-3">
            <span class="head-ic"><ui-icon [name]="icon()" [size]="19" /></span>
            <span class="title">{{ 'stage_' + stageType() | t }}</span>
          </div>
          <div class="sub">{{ i18n.t('prod_stage_orders_count', { n: data()?.total || 0 }) }}</div>
        </div>
        <div class="row gap-3">
          @if (canWrite()) {
            <button class="btn btn-primary btn-sm" type="button" (click)="openEntry()" [attr.data-tip]="'add_operation' | t">
              <ui-icon name="plus" [size]="15" /> {{ 'add_operation' | t }}
            </button>
          }
          @if (isLoading()) {
            <button class="btn btn-sm" type="button" (click)="shipmentModal.set({})" [attr.data-tip]="'new_shipment' | t">
              <ui-icon name="truck" [size]="15" /> {{ 'new_shipment' | t }}
            </button>
          }
        </div>
      </div>

      <!-- summary strip -->
      <div class="stats mb-6">
        <div class="stat"><div class="k">{{ 'plan_label' | t }}</div><div class="v">{{ sum().plan | num }}</div></div>
        <div class="stat"><div class="k">{{ 'actual_label' | t }}</div><div class="v" style="color:var(--success)">{{ sum().done | num }}</div></div>
        <div class="stat"><div class="k">{{ 'remaining_label' | t }}</div><div class="v">{{ sum().remaining | num }}</div></div>
        <div class="stat"><div class="k">{{ 'defect_label' | t }}</div><div class="v" [style.color]="sum().defect ? 'var(--danger)' : ''">{{ sum().defect | num }}</div></div>
        <div class="stat"><div class="k">{{ 'progress' | t }}</div><div class="v">{{ sum().progress }}%</div></div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <ui-icon name="search" [size]="15" />
            <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
          </div>
          <select class="select" style="width:auto;min-width:160px" [(ngModel)]="status" (ngModelChange)="reload()">
            <option value="">{{ 'status' | t }}: {{ 'all' | t }}</option>
            @for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
          </select>
          <div class="grow"></div>
          @if (rt.connected()) { <span class="badge badge-success"><i class="dot"></i>{{ 'live' | t }}</span> }
        </div>

        @if (loading()) {
          <ui-loading />
        } @else if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>{{ 'order_no' | t }}</th>
                    <th>{{ 'model' | t }}</th>
                    <th class="num">{{ 'plan_label' | t }}</th>
                    <th class="num">{{ 'actual_label' | t }}</th>
                    <th class="num">{{ 'remaining_label' | t }}</th>
                    <th class="num">{{ 'defect_label' | t }}</th>
                    <th style="width:160px">{{ 'progress' | t }}</th>
                    <th>{{ 'status' | t }}</th>
                    <th>{{ 'responsible' | t }}</th>
                    <th>{{ 'deadline' | t }}</th>
                    <th class="actions">{{ 'actions' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of d.items; track s.id) {
                    <tr>
                      <td><a class="mono bold" [routerLink]="['/orders', s.order?.id]">{{ s.order?.number }}</a></td>
                      <td>
                        <div class="small">{{ s.order?.model?.code || '—' }}</div>
                        <div class="tiny text-3 truncate" style="max-width:150px">{{ s.order?.client?.name }}</div>
                      </td>
                      <td class="num">{{ s.planQty | num }}</td>
                      <td class="num bold">{{ s.doneQty | num }}</td>
                      <td class="num">{{ s.remainingQty | num }}</td>
                      <td class="num" [style.color]="s.defectQty ? 'var(--danger)' : ''">{{ s.defectQty | num }}</td>
                      <td><ui-progress [value]="s.doneQty" [max]="s.planQty" /></td>
                      <td><ui-status [value]="s.status" /></td>
                      <td class="small">{{ s.responsible ? s.responsible.lastName : '—' }}</td>
                      <td class="small nowrap">{{ s.order?.deadline | shortDate }}</td>
                      <td class="actions">
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="$event.stopPropagation(); openDetail(s)" [attr.data-tip]="'view' | t">
                          <ui-icon name="eye" [size]="15" />
                        </button>
                        @if (canWrite() && s.status !== 'COMPLETED') {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="$event.stopPropagation(); openEntry(s)" [attr.data-tip]="'add_operation' | t">
                            <ui-icon name="plus" [size]="15" />
                          </button>
                        }
                        @if (canWrite()) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="$event.stopPropagation(); openDefect(s)" [attr.data-tip]="'add_defect' | t">
                            <ui-icon name="alert-triangle" [size]="15" />
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination [page]="d.page" [limit]="d.limit" [total]="d.total" [totalPages]="d.pages"
                           (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); reload()" />
          } @else {
            <ui-empty [icon]="icon()" [title]="'no_data' | t" [message]="'prod_no_orders' | t" />
          }
        }
      </div>

      <!-- shipments (Ortish) -->
      @if (isLoading()) {
        <div class="card mt-6">
          <div class="card-head"><h3>{{ 'shipments' | t }}</h3></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>{{ 'order_no' | t }}</th><th>{{ 'client' | t }}</th><th>{{ 'vehicle' | t }}</th><th>{{ 'driver' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th class="num">{{ 'box_count' | t }}</th><th>{{ 'loading_date' | t }}</th><th>{{ 'status' | t }}</th><th class="actions"></th></tr></thead>
              <tbody>
                @for (s of shipments(); track s.id) {
                  <tr>
                    <td><a class="mono bold" [routerLink]="['/orders', s.order?.id]">{{ s.order?.number }}</a></td>
                    <td class="small">{{ s.order?.client?.name }}</td>
                    <td class="small">{{ s.vehicle || '—' }}</td>
                    <td class="small">{{ s.driver || '—' }}</td>
                    <td class="num">{{ s.qty | num }}</td>
                    <td class="num">{{ s.boxCount }}</td>
                    <td class="small nowrap">{{ s.loadingDate | shortDate }}</td>
                    <td><ui-status [value]="s.status" /></td>
                    <td class="actions">
                      @if (canWrite()) {
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="shipmentModal.set(s)" [attr.data-tip]="'edit' | t">
                          <ui-icon name="pencil" [size]="15" />
                        </button>
                      }
                    </td>
                  </tr>
                } @empty { <tr><td colspan="9"><ui-empty icon="truck" [title]="'no_data' | t" /></td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <!-- ─── add operation ─── -->
    @if (entryModal()) {
      <ui-modal [title]="'add_operation' | t" [subtitle]="'stage_' + stageType() | t" (closed)="entryModal.set(null)">
        <div class="form-grid">
          <div class="field full">
            <label class="label">{{ 'order' | t }} <span class="req">*</span></label>
            <select class="select" [(ngModel)]="entry.orderId">
              <option value="">—</option>
              @for (s of openStages(); track s.id) {
                <option [value]="s.order?.id">{{ s.order?.number }} · {{ s.order?.model?.code }} — {{ s.doneQty }}/{{ s.planQty }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label class="label">{{ 'operation_qty' | t }} <span class="req">*</span></label>
            <input class="input" type="number" min="1" [(ngModel)]="entry.qty" />
          </div>
          <div class="field">
            <label class="label">{{ 'defect_qty' | t }}</label>
            <input class="input" type="number" min="0" [(ngModel)]="entry.defectQty" />
          </div>
          <div class="field">
            <label class="label">{{ 'date' | t }}</label>
            <input class="input" type="date" [(ngModel)]="entry.date" />
          </div>

          <!-- stage-specific fields -->
          @switch (stageType()) {
            @case ('WASHING') {
              <div class="field"><label class="label">{{ 'batch' | t }}</label><input class="input" [(ngModel)]="entry.meta['batch']" /></div>
              <div class="field"><label class="label">{{ 'washing_type' | t }}</label><input class="input" [(ngModel)]="entry.meta['washingType']" placeholder="Stone wash / Enzyme" /></div>
              <div class="field"><label class="label">{{ 'returned_date' | t }}</label><input class="input" type="date" [(ngModel)]="entry.meta['returnedDate']" /></div>
            }
            @case ('LASER') {
              <div class="field"><label class="label">{{ 'machine' | t }}</label><input class="input" [(ngModel)]="entry.meta['machine']" /></div>
              <div class="field"><label class="label">{{ 'operator' | t }}</label><input class="input" [(ngModel)]="entry.meta['operator']" /></div>
              <div class="field"><label class="label">{{ 'design_code' | t }}</label><input class="input" [(ngModel)]="entry.meta['design']" /></div>
            }
            @case ('PACKING') {
              <div class="field"><label class="label">{{ 'box_count' | t }}</label><input class="input" type="number" min="0" [(ngModel)]="entry.meta['boxCount']" /></div>
              <div class="field">
                <label class="label">{{ 'sub_stage' | t }}</label>
                <select class="select" [(ngModel)]="entry.meta['subStage']">
                  <option value="">—</option>
                  <option value="CLEANING">{{ 'pack_sub_CLEANING' | t }}</option>
                  <option value="IRONING">{{ 'pack_sub_IRONING' | t }}</option>
                  <option value="ACCESSORIES">{{ 'pack_sub_ACCESSORIES' | t }}</option>
                  <option value="SCANNING">{{ 'pack_sub_SCANNING' | t }}</option>
                  <option value="BOXING">{{ 'pack_sub_BOXING' | t }}</option>
                </select>
              </div>
            }
            @case ('LOADING') {
              <div class="field"><label class="label">{{ 'vehicle' | t }}</label><input class="input" [(ngModel)]="entry.meta['vehicle']" /></div>
              <div class="field"><label class="label">{{ 'driver' | t }}</label><input class="input" [(ngModel)]="entry.meta['driver']" /></div>
              <div class="field"><label class="label">{{ 'box_count' | t }}</label><input class="input" type="number" min="0" [(ngModel)]="entry.meta['boxCount']" /></div>
            }
          }

          <div class="field full">
            <label class="label">{{ 'note' | t }}</label>
            <input class="input" [(ngModel)]="entry.note" />
          </div>
        </div>
        @if (entryError()) { <div class="err-text mt-3">{{ entryError() }}</div> }

        <div footer>
          <button class="btn" type="button" (click)="entryModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveEntry()" [disabled]="busy() || !entry.orderId || !entry.qty">
            @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'save' | t }} }
          </button>
        </div>
      </ui-modal>
    }

    <!-- ─── add defect ─── -->
    @if (defectModal(); as s) {
      <ui-modal [title]="'add_defect' | t" [subtitle]="s.order?.number || ''" (closed)="defectModal.set(null)">
        <div class="form-grid">
          <div class="field"><label class="label">{{ 'defect_type' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="defect.type" /></div>
          <div class="field"><label class="label">{{ 'quantity' | t }} <span class="req">*</span></label><input class="input" type="number" min="1" [(ngModel)]="defect.qty" /></div>
          <div class="field full"><label class="label">{{ 'defect_reason' | t }}</label><input class="input" [(ngModel)]="defect.reason" /></div>
          <div class="field full"><label class="label">{{ 'comment' | t }}</label><textarea class="textarea" rows="2" [(ngModel)]="defect.comment"></textarea></div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="defectModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-danger" type="button" (click)="saveDefect(s)" [disabled]="busy() || !defect.type || !defect.qty">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    <!-- ─── stage detail ─── -->
    @if (detail(); as s) {
      <ui-modal size="lg" [title]="s.order?.number || ''" [subtitle]="detailSubtitle(s)" (closed)="detail.set(null)">
        <div class="stats mb-4">
          <div class="stat"><div class="k">{{ 'model' | t }}</div><div class="v small">{{ s.order?.model?.code || '—' }}</div></div>
          <div class="stat"><div class="k">{{ 'plan_label' | t }}</div><div class="v" style="font-size:21px">{{ s.planQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'actual_label' | t }}</div><div class="v" style="font-size:21px;color:var(--success)">{{ s.doneQty | num }}</div></div>
          <div class="stat"><div class="k">{{ 'defect_label' | t }}</div><div class="v" style="font-size:21px;color:var(--danger)">{{ s.defectQty | num }}</div></div>
        </div>

        @if (canWrite()) {
          <div class="row gap-2 mb-4 wrap">
            <select class="select" style="width:auto;min-width:170px" [(ngModel)]="assignId">
              <option value="">{{ 'responsible' | t }}…</option>
              @for (u of users(); track u.id) { <option [value]="u.id">{{ u.lastName }} {{ u.firstName }}</option> }
            </select>
            <button class="btn btn-sm" type="button" (click)="assign(s)" [disabled]="!assignId">{{ 'save' | t }}</button>
          </div>
        }

        <b class="small">{{ 'entries' | t }}</b>
        <div class="table-wrap mt-2">
          <table class="data">
            <thead><tr><th>{{ 'date' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th class="num">{{ 'defect_label' | t }}</th><th>{{ 'who' | t }}</th><th>{{ 'source' | t }}</th><th class="actions"></th></tr></thead>
            <tbody>
              @for (e of s.entries; track e.id) {
                <tr [style.opacity]="e.cancelled ? .45 : 1">
                  <td class="small nowrap">{{ e.date | shortDate: true }}</td>
                  <td class="num bold">{{ e.qty > 0 ? '+' : '' }}{{ e.qty }}</td>
                  <td class="num">{{ e.defectQty || '—' }}</td>
                  <td class="small">{{ e.user ? e.user.lastName + ' ' + e.user.firstName : '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-info]="e.source === 'TELEGRAM'" [class.badge-neutral]="e.source !== 'TELEGRAM'">
                      {{ e.source }}
                    </span>
                  </td>
                  <td class="actions">
                    @if (canWrite() && !e.cancelled && e.qty > 0) {
                      <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="cancelling.set(e)" [attr.data-tip]="'cancel_entry' | t">
                        <ui-icon name="rotate-ccw" [size]="14" />
                      </button>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="6"><ui-empty icon="history" [title]="'no_data' | t" /></td></tr> }
            </tbody>
          </table>
        </div>

        <div footer><button class="btn" type="button" (click)="detail.set(null)">{{ 'close' | t }}</button></div>
      </ui-modal>
    }

    @if (cancelling(); as e) {
      <ui-confirm
        [title]="'cancel_entry' | t"
        [message]="'+' + e.qty + ' dona operatsiyasini bekor qilasizmi?'"
        [note]="'cancel_entry_note' | t"
        [confirmLabel]="'confirm' | t"
        (confirmed)="cancelEntry(e)" (cancelled)="cancelling.set(null)" />
    }

    <!-- ─── shipment ─── -->
    @if (shipmentModal(); as sh) {
      <ui-modal [title]="'new_shipment' | t" (closed)="shipmentModal.set(null)">
        <div class="form-grid">
          <div class="field full">
            <label class="label">{{ 'order' | t }} <span class="req">*</span></label>
            <select class="select" [(ngModel)]="shipment.orderId" [disabled]="!!sh.id">
              <option value="">—</option>
              @for (s of data()?.items || []; track s.id) { <option [value]="s.order?.id">{{ s.order?.number }}</option> }
            </select>
          </div>
          <div class="field"><label class="label">{{ 'vehicle' | t }}</label><input class="input" [(ngModel)]="shipment.vehicle" /></div>
          <div class="field"><label class="label">{{ 'driver' | t }}</label><input class="input" [(ngModel)]="shipment.driver" /></div>
          <div class="field"><label class="label">{{ 'driver_phone' | t }}</label><input class="input" [(ngModel)]="shipment.driverPhone" /></div>
          <div class="field"><label class="label">{{ 'quantity' | t }}</label><input class="input" type="number" min="0" [(ngModel)]="shipment.qty" /></div>
          <div class="field"><label class="label">{{ 'box_count' | t }}</label><input class="input" type="number" min="0" [(ngModel)]="shipment.boxCount" /></div>
          <div class="field"><label class="label">{{ 'loading_date' | t }}</label><input class="input" type="date" [(ngModel)]="shipment.loadingDate" /></div>
          <div class="field"><label class="label">{{ 'track_no' | t }}</label><input class="input" [(ngModel)]="shipment.trackNo" /></div>
          <div class="field">
            <label class="label">{{ 'status' | t }}</label>
            <select class="select" [(ngModel)]="shipment.status">
              @for (s of shipmentStatuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
            </select>
          </div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="shipmentModal.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveShipment(sh)" [disabled]="busy() || !shipment.orderId">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .head-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--primary-50); color: var(--primary); display: flex; align-items: center; justify-content: center; }
  `],
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
  readonly limit = signal(20);
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

  entry = { orderId: '', qty: null as number | null, defectQty: 0, date: new Date().toISOString().slice(0, 10), note: '', meta: {} as Record<string, unknown> };
  defect = { type: '', qty: null as number | null, reason: '', comment: '' };
  shipment: Partial<Shipment> & { orderId?: string } = {};

  readonly stageType = computed<StageType>(() => SLUG_TO_STAGE[this.stage()?.toLowerCase()] ?? 'CUTTING');
  readonly icon = computed(() => STAGE_ICON[this.stageType()]);
  readonly isLoading = computed(() => this.stageType() === 'LOADING');
  readonly canWrite = computed(() => this.auth.can(`${this.stage().toLowerCase()}.create`, `${this.stage().toLowerCase()}.update`));
  readonly openStages = computed(() => (this.data()?.items ?? []).filter((s) => s.status !== 'COMPLETED'));

  readonly sum = computed(() => {
    const items = this.data()?.items ?? [];
    const plan = items.reduce((a, s) => a + s.planQty, 0);
    const done = items.reduce((a, s) => a + s.doneQty, 0);
    const defect = items.reduce((a, s) => a + s.defectQty, 0);
    return { plan, done, defect, remaining: Math.max(0, plan - done), progress: plan ? Math.round((done / plan) * 100) : 0 };
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

    this.api.get<{ items: User[] }>('/users', { limit: 100 }).subscribe({
      next: (r) => this.users.set(r.items), error: () => void 0,
    });
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
        next: (d) => { this.data.set(d); this.loading.set(false); },
        error: () => this.loading.set(false),
      });

    if (this.isLoading()) {
      this.api.get<Shipment[]>('/production/shipments').subscribe({
        next: (s) => this.shipments.set(s), error: () => void 0,
      });
    }
  }

  openEntry(s?: OrderStage): void {
    this.entry = {
      orderId: s?.order?.id ?? '', qty: null, defectQty: 0,
      date: new Date().toISOString().slice(0, 10), note: '', meta: {},
    };
    this.entryError.set('');
    this.entryModal.set(s ?? {});
  }

  saveEntry(): void {
    this.busy.set(true);
    this.entryError.set('');
    const meta = Object.fromEntries(Object.entries(this.entry.meta).filter(([, v]) => v !== '' && v != null));
    this.api
      .post(`/production/${this.stage().toLowerCase()}/entries`, {
        orderId: this.entry.orderId,
        qty: +this.entry.qty!,
        defectQty: +(this.entry.defectQty || 0),
        date: this.entry.date ? new Date(this.entry.date).toISOString() : undefined,
        note: this.entry.note || undefined,
        meta: Object.keys(meta).length ? meta : undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.entryModal.set(null);
          this.toast.success(this.i18n.t('saved'));
          this.reload(false);
        },
        error: (e) => {
          this.busy.set(false);
          const m = e?.error?.message;
          this.entryError.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
        },
      });
  }

  openDefect(s: OrderStage): void {
    this.defect = { type: '', qty: null, reason: '', comment: '' };
    this.defectModal.set(s);
  }

  saveDefect(s: OrderStage): void {
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

  saveShipment(sh: Partial<Shipment>): void {
    this.busy.set(true);
    const body = {
      ...this.shipment,
      loadingDate: this.shipment.loadingDate ? new Date(this.shipment.loadingDate).toISOString() : undefined,
      qty: this.shipment.qty ? +this.shipment.qty : 0,
      boxCount: this.shipment.boxCount ? +this.shipment.boxCount : 0,
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
}
