import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Client, Order, OrderStatus, Priority, ProductModel, User } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';

interface SizeRow { size: string; qty: number | null; }

@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [FormsModule, ModalComponent, IconComponent, DateInputComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-modal [title]="isNew() ? ('new_order' | t) : ('edit_order' | t)" [subtitle]="form.number" size="lg" (closed)="closed.emit()">
      <div class="form-grid">
        <div class="field" [class.field-invalid]="fe.has('number')">
          <label class="label">{{ 'order_no' | t }} <span class="req">*</span></label>
          <input class="input mono" [(ngModel)]="form.number" [placeholder]="'order_no_placeholder' | t" (ngModelChange)="fe.clear('number')" />
          @if (fe.get('number'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>

        <div class="field">
          <label class="label">{{ 'client' | t }}</label>
          <div class="row gap-2">
            <select class="select grow" [(ngModel)]="form.clientId">
              <option value="" disabled>{{ 'select_client' | t }}</option>
              @for (c of clientOptions(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            @if (canAddClient()) {
              <button class="btn btn-sm" type="button" (click)="openClientForm()" [attr.data-tip]="'add_client' | t">
                <ui-icon name="plus" [size]="14" />
              </button>
            }
          </div>
        </div>

        <div class="field full">
          <label class="label">{{ 'model' | t }}</label>
          <select class="select" [(ngModel)]="form.modelId" (ngModelChange)="onModelChange()">
            <option value="" disabled>{{ 'select_model' | t }}</option>
            @for (m of models(); track m.id) { <option [value]="m.id">{{ m.code }} — {{ m.name }}</option> }
          </select>
        </div>

        <div class="field" [class.field-invalid]="fe.has('qty')">
          <label class="label">{{ 'quantity' | t }} <span class="req">*</span></label>
          <input class="input" type="number" min="1" [(ngModel)]="form.qty" (ngModelChange)="fe.clear('qty')" />
          @if (fe.get('qty'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>

        <div class="field">
          <label class="label">{{ 'priority' | t }}</label>
          <select class="select" [(ngModel)]="form.priority">
            <option value="" disabled>{{ 'select_priority' | t }}</option>
            @for (p of priorities; track p) { <option [value]="p">{{ 'pr_' + p | t }}</option> }
          </select>
        </div>

        <div class="field" [class.field-invalid]="fe.has('orderDate')">
          <label class="label">{{ 'order_date' | t }} <span class="req">*</span></label>
          <ui-date-input [(ngModel)]="form.orderDate" (ngModelChange)="fe.clear('orderDate')" />
          @if (fe.get('orderDate'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>

        <div class="field" [class.field-invalid]="fe.has('deadline')">
          <label class="label">{{ 'deadline' | t }} <span class="req">*</span></label>
          <ui-date-input [(ngModel)]="form.deadline" (ngModelChange)="fe.clear('deadline')" />
          @if (fe.get('deadline'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>

        <div class="field">
          <label class="label">{{ 'status' | t }}</label>
          <select class="select" [(ngModel)]="form.status">
            <option value="" disabled>{{ 'select_status' | t }}</option>
            @for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
          </select>
        </div>

        <div class="field">
          <label class="label">{{ 'responsible' | t }}</label>
          <select class="select" [(ngModel)]="form.responsibleId">
            <option value="" disabled>{{ 'select_responsible' | t }}</option>
            @for (u of users(); track u.id) { <option [value]="u.id">{{ u.lastName }} {{ u.firstName }}</option> }
          </select>
        </div>

        <div class="field full">
          <label class="label">{{ 'note' | t }}</label>
          <textarea class="textarea" [(ngModel)]="form.note" rows="2"></textarea>
        </div>
      </div>

      <div class="divider"></div>

      <div class="row-between mb-3">
        <b style="font-size:13.5px">{{ 'sample' | t }}</b>
        <span class="small text-3">{{ 'sample_optional' | t }}</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <label class="label">{{ 'sample_status' | t }}</label>
          <select class="select" [(ngModel)]="form.sampleStatus">
            <option value="">{{ 'sample_not_tracked' | t }}</option>
            @for (s of sampleStatuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="label">{{ 'sample_sent' | t }}</label>
          <ui-date-input [(ngModel)]="form.sampleSentAt" />
        </div>
        <div class="field">
          <label class="label">{{ 'sample_approved' | t }}</label>
          <ui-date-input [(ngModel)]="form.sampleApprovedAt" />
        </div>
      </div>

      <div class="divider"></div>

      <div class="row-between mb-3">
        <b style="font-size:13.5px">{{ 'size_breakdown' | t }}</b>
        <div class="row gap-2">
          <span class="badge" [class.badge-success]="sizeTotal() === (form.qty ?? 0)" [class.badge-warning]="sizeTotal() !== (form.qty ?? 0)">
            {{ sizeTotal() }} / {{ form.qty ?? 0 }}
          </span>
          <button class="btn btn-sm" type="button" (click)="addSize()"><ui-icon name="plus" [size]="14" /></button>
        </div>
      </div>

      @if (sizes().length) {
        <div class="size-grid">
          @for (s of sizes(); track $index) {
            <div class="size-row">
              <input class="input btn-sm" style="width:64px;height:32px" [(ngModel)]="s.size" [placeholder]="'size_placeholder' | t" />
              <input class="input btn-sm" style="height:32px" type="number" min="0" [(ngModel)]="s.qty" (ngModelChange)="touch(); fe.clear('sizes')" [placeholder]="'plan_done_placeholder' | t" />
              <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeSize($index)" [attr.data-tip]="'delete' | t">
                <ui-icon name="x" [size]="14" />
              </button>
            </div>
          }
        </div>
        @if (fe.get('sizes'); as msg) {
          <div class="field-error mt-2">{{ msg }}</div>
        } @else if (sizeTotal() !== form.qty && sizeTotal() > 0) {
          <div class="err-text mt-2">{{ 'sizes_mismatch' | t }}</div>
        }
      } @else {
        <div class="small text-3">{{ 'sizes_empty_hint' | t }}</div>
      }

      @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }

      <div footer>
        <button class="btn" type="button" (click)="closed.emit()">{{ 'cancel' | t }}</button>
        <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy()">
          @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'save' | t }} }
        </button>
      </div>
    </ui-modal>

    @if (showClientForm()) {
      <ui-modal size="lg" [title]="'new_client' | t" (closed)="showClientForm.set(false)">
        <div class="form-grid">
          <div class="field" [class.field-invalid]="clientFe.has('code')">
            <label class="label">{{ 'client_code' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="clientForm.code" (ngModelChange)="clientFe.clear('code')" />
            @if (clientFe.get('code'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="clientFe.has('name')">
            <label class="label">{{ 'client' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="clientForm.name" (ngModelChange)="clientFe.clear('name')" />
            @if (clientFe.get('name'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field"><label class="label">{{ 'phone' | t }}</label><input class="input mono" [(ngModel)]="clientForm.phone" /></div>
          <div class="field"><label class="label">{{ 'contact' | t }}</label><input class="input" [(ngModel)]="clientForm.contact" /></div>
        </div>
        @if (clientError()) { <div class="err-text mt-3">{{ clientError() }}</div> }
        <div footer>
          <button class="btn" type="button" (click)="showClientForm.set(false)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveClient()" [disabled]="clientBusy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .size-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    .size-row { display: flex; align-items: center; gap: 6px; }
    .grow { flex: 1; min-width: 0; }
  `],
})
export class OrderFormComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

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

    this.api.get<{ items: User[] }>('/users', { limit: 100 }).subscribe({
      next: (r) => this.users.set(r.items), error: () => void 0,
    });
  }

  touch(): void { this.version.update((v) => v + 1); }

  onModelChange(): void {
    const m = this.models().find((x) => x.id === this.form.modelId);
    if (m?.sizes?.length && !this.sizes().length) {
      this.sizes.set(m.sizes.map((s) => ({ size: s.size, qty: s.qty ?? null })));
    }
    this.touch();
  }

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
        this.extraClients.update((list) => [...list, c]);
        this.form.clientId = c.id;
        this.clientsChange.emit(this.clientOptions());
        this.showClientForm.set(false);
        this.clientForm = { code: '', name: '', phone: '', contact: '' };
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
