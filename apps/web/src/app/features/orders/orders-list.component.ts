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
  templateUrl: './orders-list.component.html',
  standalone: true,
  imports: [
    FormsModule, RouterLink, IconComponent, ProgressComponent, StatusBadgeComponent, PriorityBadgeComponent,
    PaginationComponent, EmptyComponent, LoadingComponent, ConfirmComponent, OrderFormComponent, DateInputComponent,
    TableSortHeaderComponent,
    TPipe, NumPipe, ShortDatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
