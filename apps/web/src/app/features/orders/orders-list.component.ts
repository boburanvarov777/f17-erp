import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Client, Order, OrderStatus, Paginated, Priority, ProductModel } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/services/i18n.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../shared/ui/confirm.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { OrderFormComponent } from './order-form.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { TableSortHeaderComponent } from '../../shared/ui/table-sort-header.component';

const STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'LOADING', 'COMPLETED', 'DELAYED', 'CANCELLED'];
const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PriorityBadgeComponent,
    PaginationComponent, EmptyComponent, LoadingComponent, ConfirmComponent, OrderFormComponent, DateInputComponent,
    TableSortHeaderComponent,
    TPipe, NumPipe, ShortDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'orders_title' | t }}</div>
          <div class="sub">{{ i18n.t('orders_count_sub', { n: data()?.total || 0 }) }}</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm" type="button" (click)="exportCsv()" [attr.data-tip]="'export' | t"><ui-icon name="download" [size]="15" /> {{ 'export' | t }}</button>
          @if (auth.can('orders.create')) {
            <button class="btn btn-primary btn-sm" type="button" (click)="editing.set({})" [attr.data-tip]="'new_order' | t">
              <ui-icon name="plus" [size]="15" /> {{ 'new_order' | t }}
            </button>
          }
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <ui-icon name="search" [size]="15" />
            <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
          </div>

          <select class="select" style="width:auto;min-width:150px" [(ngModel)]="status" (ngModelChange)="reload()">
            <option value="">{{ 'status' | t }}: {{ 'all' | t }}</option>
            @for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
          </select>

          <select class="select" style="width:auto;min-width:140px" [(ngModel)]="priority" (ngModelChange)="reload()">
            <option value="">{{ 'priority' | t }}: {{ 'all' | t }}</option>
            @for (p of priorities; track p) { <option [value]="p">{{ 'pr_' + p | t }}</option> }
          </select>

          <select class="select" style="width:auto;min-width:150px" [(ngModel)]="clientId" (ngModelChange)="reload()">
            <option value="">{{ 'client' | t }}: {{ 'all' | t }}</option>
            @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>

          <div class="row gap-2">
            <ui-date-input style="width:145px" size="sm" [(ngModel)]="from" (ngModelChange)="reload()" />
            <span class="text-3">—</span>
            <ui-date-input style="width:145px" size="sm" [(ngModel)]="to" (ngModelChange)="reload()" />
          </div>

          @if (hasFilters()) {
            <button class="btn btn-ghost btn-sm" type="button" (click)="clearFilters()" [attr.data-tip]="'reset' | t">
              <ui-icon name="x" [size]="14" /> {{ 'reset' | t }}
            </button>
          }
        </div>

        @if (loading()) {
          <ui-loading />
        } @else if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th class="sortable" [class.active]="sortBy() === 'number'" (click)="sort('number')">
                      <ui-table-sort [active]="sortBy() === 'number'" [direction]="sortOrder()">{{ 'order_no' | t }}</ui-table-sort>
                    </th>
                    <th>{{ 'model' | t }}</th>
                    <th>{{ 'client' | t }}</th>
                    <th class="sortable" [class.active]="sortBy() === 'orderDate'" (click)="sort('orderDate')">
                      <ui-table-sort [active]="sortBy() === 'orderDate'" [direction]="sortOrder()">{{ 'order_date' | t }}</ui-table-sort>
                    </th>
                    <th class="sortable" [class.active]="sortBy() === 'deadline'" (click)="sort('deadline')">
                      <ui-table-sort [active]="sortBy() === 'deadline'" [direction]="sortOrder()">{{ 'deadline' | t }}</ui-table-sort>
                    </th>
                    <th class="num sortable" [class.active]="sortBy() === 'qty'" (click)="sort('qty')">
                      <ui-table-sort align="end" [active]="sortBy() === 'qty'" [direction]="sortOrder()">{{ 'quantity' | t }}</ui-table-sort>
                    </th>
                    <th class="num">{{ 'completed' | t }}</th>
                    <th class="num">{{ 'remaining' | t }}</th>
                    <th style="width:150px">{{ 'progress' | t }}</th>
                    <th>{{ 'status' | t }}</th>
                    <th>{{ 'priority' | t }}</th>
                    <th>{{ 'responsible' | t }}</th>
                    <th class="actions">{{ 'actions' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (o of d.items; track o.id) {
                    <tr class="clickable" [routerLink]="['/orders', o.id]">
                      <td><b class="mono">{{ o.number }}</b></td>
                      <td>
                        @if (o.model) {
                          <div class="small bold">{{ o.model.code }}</div>
                          <div class="tiny text-3 truncate" style="max-width:150px">{{ o.model.name }}</div>
                        } @else { <span class="text-3">—</span> }
                      </td>
                      <td class="small">{{ o.client?.name || '—' }}</td>
                      <td class="small nowrap">{{ o.orderDate | shortDate }}</td>
                      <td class="nowrap">
                        <span class="small" [style.color]="o.isLate ? 'var(--danger)' : ''" [style.font-weight]="o.isLate ? 600 : 400">
                          {{ o.deadline | shortDate }}
                        </span>
                      </td>
                      <td class="num">{{ o.qty | num }}</td>
                      <td class="num">{{ o.completedQty | num }}</td>
                      <td class="num">{{ o.remainingQty | num }}</td>
                      <td><ui-progress [value]="o.progress || 0" [max]="100" [late]="!!o.isLate" [showLabel]="false" /></td>
                      <td><ui-status [value]="o.status" /></td>
                      <td><ui-priority [value]="o.priority" /></td>
                      <td class="small">{{ o.responsible ? o.responsible.lastName + ' ' + o.responsible.firstName[0] + '.' : '—' }}</td>
                      <td class="actions" (click)="$event.stopPropagation()">
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" [routerLink]="['/orders', o.id]" (click)="$event.stopPropagation()" [attr.data-tip]="'view' | t">
                          <ui-icon name="eye" [size]="15" />
                        </button>
                        @if (auth.can('orders.update')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="$event.stopPropagation(); editing.set(o)" [attr.data-tip]="'edit' | t">
                            <ui-icon name="pencil" [size]="15" />
                          </button>
                        }
                        @if (auth.can('orders.delete')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="$event.stopPropagation(); archiving.set(o)" [attr.data-tip]="'archive' | t">
                            <ui-icon name="archive" [size]="15" />
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination [page]="page()" [limit]="limit()" [total]="d.total" [totalPages]="d.pages"
                           (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); page.set(1); reload(false)" />
          } @else {
            <ui-empty icon="clipboard-list" [title]="'no_orders' | t" [message]="'orders_empty_hint' | t">
              @if (auth.can('orders.create')) {
                <button class="btn btn-primary btn-sm mt-2" type="button" (click)="editing.set({})" [attr.data-tip]="'new_order' | t">
                  <ui-icon name="plus" [size]="15" /> {{ 'new_order' | t }}
                </button>
              }
            </ui-empty>
          }
        }
      </div>
    </div>

    @if (editing(); as o) {
      <app-order-form [order]="o" [clients]="clients()" [models]="models()"
                       (clientsChange)="clients.set($event)"
                       (saved)="onSaved()" (closed)="editing.set(null)" />
    }

    @if (archiving(); as o) {
      <ui-confirm
        [title]="'archive' | t"
        [message]="'order_archive_confirm' | t: { name: o.number }"
        [note]="'order_archive_note' | t"
        [confirmLabel]="'archive' | t"
        (confirmed)="archive(o)"
        (cancelled)="archiving.set(null)" />
    }
  `,
})
export class OrdersListComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;

  search = '';
  status = '';
  priority = '';
  clientId = '';
  from = '';
  to = '';

  readonly page = signal(1);
  readonly limit = signal(10);
  readonly sortBy = signal('createdAt');
  readonly sortOrder = signal<'asc' | 'desc'>('desc');

  readonly data = signal<Paginated<Order> | null>(null);
  readonly clients = signal<Client[]>([]);
  readonly models = signal<ProductModel[]>([]);
  readonly loading = signal(false);
  readonly editing = signal<Partial<Order> | null>(null);
  readonly archiving = signal<Order | null>(null);

  readonly hasFilters = computed(() => !!(this.search || this.status || this.priority || this.clientId || this.from || this.to));

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const qp = new URLSearchParams(location.search);
    this.clientId = qp.get('clientId') ?? '';
    this.search = qp.get('search') ?? '';
    this.reload();
    this.api.get<Client[]>('/clients').subscribe({ next: (c) => this.clients.set(c), error: () => void 0 });
    this.api.get<Paginated<ProductModel>>('/models', { limit: 200 }).subscribe({
      next: (m) => this.models.set(m.items), error: () => void 0,
    });
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 320);
  }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.api
      .get<Paginated<Order>>('/orders', {
        page: this.page(), limit: this.limit(), search: this.search,
        status: this.status, priority: this.priority, clientId: this.clientId,
        from: this.from, to: this.to, sortBy: this.sortBy(), sortOrder: this.sortOrder(),
      })
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.page.set(d.page);
          this.limit.set(d.limit);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  sort(field: string): void {
    if (this.sortBy() === field) this.sortOrder.update((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { this.sortBy.set(field); this.sortOrder.set('asc'); }
    this.reload();
  }

  clearFilters(): void {
    this.search = ''; this.status = ''; this.priority = ''; this.clientId = ''; this.from = ''; this.to = '';
    this.reload();
  }

  onSaved(): void {
    this.editing.set(null);
    this.toast.success(this.i18n.t('saved'));
    this.reload(false);
  }

  archive(o: Order): void {
    this.api.delete(`/orders/${o.id}`).subscribe({
      next: () => {
        this.archiving.set(null);
        this.toast.success(this.i18n.t('archived'), o.number);
        this.reload(false);
      },
      error: () => this.archiving.set(null),
    });
  }

  exportCsv(): void {
    this.api
      .download('/orders/export', { search: this.search, status: this.status, clientId: this.clientId, from: this.from, to: this.to })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => void 0,
      });
  }
}
