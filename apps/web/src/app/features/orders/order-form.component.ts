import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Client, Order, OrderStatus, Priority, ProductModel, User } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { SizeRowFieldsComponent } from '../../shared/components/size-row-fields.component';
import { DigitsOnlyDirective } from '../../shared/directives/digits-only.directive';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';

interface SizeRow { size: string; qty: number | null; }

@Component({
  selector: 'app-order-form',
  templateUrl: './order-form.component.html',
  styleUrl: './order-form.component.scss',
  standalone: true,
  imports: [FormsModule, ModalComponent, IconComponent, DateInputComponent, TPipe, NumPipe, DigitsOnlyDirective, GroupedNumberDirective, SizeRowFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderFormComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly fe = new FieldErrorsState();
  readonly clientFe = new FieldErrorsState();

  readonly order = input.required<Partial<Order>>();
  readonly clients = input<Client[]>([]);
  readonly models = input<ProductModel[]>([]);
  readonly saved = output<void>();
  readonly closed = output<void>();
  readonly clientsChange = output<Client[]>();

  readonly statuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'LOADING', 'COMPLETED', 'DELAYED', 'CANCELLED'];
  readonly priorities: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  readonly sampleStatuses = ['PENDING', 'SENT', 'APPROVED', 'REJECTED'];

  readonly users = signal<User[]>([]);
  readonly extraClients = signal<Client[]>([]);
  readonly sizes = signal<SizeRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly showClientForm = signal(false);
  readonly clientBusy = signal(false);
  readonly clientError = signal('');
  private version = signal(0);

  clientForm = { code: '', name: '', phone: '', contact: '' };

  form = {
    number: '', clientId: '', modelId: '', qty: null as number | null,
    orderDate: '',
    deadline: '', priority: '' as Priority | '', status: '' as OrderStatus | '',
    note: '', responsibleId: '',
    sampleStatus: '', sampleSentAt: '', sampleApprovedAt: '',
  };

  readonly isNew = computed(() => !this.order()?.id);
  readonly clientOptions = computed(() => {
    const map = new Map<string, Client>();
    for (const c of [...this.clients(), ...this.extraClients()]) map.set(c.id, c);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly canAddClient = computed(() => this.auth.can('clients.create', 'orders.create'));
  readonly canPickResponsible = computed(() => this.auth.can('users.read'));
  readonly modelSizeOptions = computed(() => {
    const m = this.models().find((x) => x.id === this.form.modelId);
    return (m?.sizes ?? []).map((s) => s.size);
  });
  readonly sizeTotal = computed(() => { this.version(); return this.sizes().reduce((a, s) => a + (+s.qty! || 0), 0); });

  constructor() {
    this.fe.reset();
    queueMicrotask(() => {
      const o = this.order();
      if (o?.id) {
        this.form = {
          number: o.number ?? '',
          clientId: o.client?.id ?? '',
          modelId: o.model?.id ?? '',
          qty: o.qty ?? null,
          orderDate: (o.orderDate ?? '').slice(0, 10),
          deadline: (o.deadline ?? '').slice(0, 10),
          priority: o.priority ?? 'NORMAL',
          status: o.status ?? 'NEW',
          note: o.note ?? '',
          responsibleId: o.responsible?.id ?? '',
          sampleStatus: o.sampleStatus ?? '',
          sampleSentAt: (o.sampleSentAt ?? '').slice(0, 10),
          sampleApprovedAt: (o.sampleApprovedAt ?? '').slice(0, 10),
        };
        this.sizes.set((o.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
      }
      this.touch();
    });

    if (this.auth.can('users.read')) {
      this.api.get<{ items: User[] }>('/users', { limit: 100 }).subscribe({
        next: (r) => this.users.set(r.items), error: () => void 0,
      });
    }
  }

  touch(): void { this.version.update((v) => v + 1); }

  addSize(): void { this.sizes.update((s) => [...s, { size: '', qty: null }]); this.touch(); this.fe.clear('sizes'); }
  removeSize(i: number): void { this.sizes.update((s) => s.filter((_, idx) => idx !== i)); this.touch(); this.fe.clear('sizes'); }

  openClientForm(): void {
    this.clientFe.reset();
    this.clientError.set('');
    this.showClientForm.set(true);
  }

  saveClient(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.clientFe.apply(runValidation([
      { key: 'code', label: t('client_code'), value: this.clientForm.code, required: true },
      { key: 'name', label: t('client'), value: this.clientForm.name, required: true },
    ], t))) return;

    this.clientBusy.set(true);
    this.clientError.set('');
    this.api.post<Client>('/clients', {
      code: this.clientForm.code.trim(),
      name: this.clientForm.name.trim(),
      phone: this.clientForm.phone.trim() || undefined,
      contact: this.clientForm.contact.trim() || undefined,
    }).subscribe({
      next: (c) => {
        this.clientBusy.set(false);
        this.extraClients.update((list) => [c, ...list]);
        this.form.clientId = c.id;
        this.clientsChange.emit(this.clientOptions());
        this.showClientForm.set(false);
        this.clientForm = { code: '', name: '', phone: '', contact: '' };
        this.toast.success(this.i18n.t('saved'), c.name);
      },
      error: (e) => {
        this.clientBusy.set(false);
        const m = e?.error?.message;
        this.clientError.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const sizeTotal = this.sizeTotal();
    if (!this.fe.apply(runValidation([
      { key: 'number', label: t('order_no'), value: this.form.number, required: true },
      { key: 'qty', label: t('quantity'), value: this.form.qty, custom: (v) => isMissingQty(v) ? t('field_required', { field: t('quantity') }) : null },
      { key: 'orderDate', label: t('order_date'), value: this.form.orderDate, required: true },
      { key: 'deadline', label: t('deadline'), value: this.form.deadline, required: true },
      {
        key: 'sizes',
        label: t('size_breakdown'),
        value: sizeTotal,
        when: () => this.sizes().length > 0,
        custom: () => sizeTotal === +(this.form.qty ?? 0) ? null : t('sizes_mismatch'),
      },
    ], t))) return;

    this.busy.set(true);
    this.error.set('');

    const sizes = this.sizes().filter((s) => s.size && (s.qty ?? 0) > 0);
    const body: Record<string, unknown> = {
      number: this.form.number.trim(),
      clientId: this.form.clientId || undefined,
      modelId: this.form.modelId || undefined,
      qty: +this.form.qty!,
      orderDate: new Date(this.form.orderDate).toISOString(),
      deadline: new Date(this.form.deadline).toISOString(),
      priority: this.form.priority || 'NORMAL',
      status: this.form.status || 'NEW',
      note: this.form.note || undefined,
      responsibleId: this.form.responsibleId || undefined,
      sampleStatus: this.form.sampleStatus || undefined,
      sampleSentAt: this.form.sampleSentAt ? new Date(this.form.sampleSentAt).toISOString() : undefined,
      sampleApprovedAt: this.form.sampleApprovedAt ? new Date(this.form.sampleApprovedAt).toISOString() : undefined,
      sizes: sizes.length ? sizes.map((s) => ({ size: s.size, qty: +(s.qty ?? 0) })) : undefined,
    };

    const id = this.order()?.id;
    const req = id ? this.api.patch(`/orders/${id}`, body) : this.api.post('/orders', body);

    req.subscribe({
      next: () => { this.busy.set(false); this.saved.emit(); },
      error: (e) => {
        this.busy.set(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }
}
