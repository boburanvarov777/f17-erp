import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Client, Order, OrderStatus, Priority, ProductModel, User } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';

interface SizeRow { size: string; qty: number; }

@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [FormsModule, ModalComponent, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-modal [title]="isNew() ? ('new_order' | t) : ('edit_order' | t)" [subtitle]="form.number" size="lg" (closed)="closed.emit()">
      <div class="form-grid">
        <div class="field">
          <label class="label">{{ 'order_no' | t }} <span class="req">*</span></label>
          <input class="input mono" [(ngModel)]="form.number" placeholder="ZR-2026-060" />
        </div>

        <div class="field">
          <label class="label">{{ 'client' | t }}</label>
          <select class="select" [(ngModel)]="form.clientId">
            <option value="">—</option>
            @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </div>

        <div class="field full">
          <label class="label">{{ 'model' | t }}</label>
          <select class="select" [(ngModel)]="form.modelId" (ngModelChange)="onModelChange()">
            <option value="">—</option>
            @for (m of models(); track m.id) { <option [value]="m.id">{{ m.code }} — {{ m.name }}</option> }
          </select>
        </div>

        <div class="field">
          <label class="label">{{ 'quantity' | t }} <span class="req">*</span></label>
          <input class="input" type="number" min="1" [(ngModel)]="form.qty" />
        </div>

        <div class="field">
          <label class="label">{{ 'priority' | t }}</label>
          <select class="select" [(ngModel)]="form.priority">
            @for (p of priorities; track p) { <option [value]="p">{{ 'pr_' + p | t }}</option> }
          </select>
        </div>

        <div class="field">
          <label class="label">{{ 'order_date' | t }} <span class="req">*</span></label>
          <input class="input" type="date" [(ngModel)]="form.orderDate" />
        </div>

        <div class="field">
          <label class="label">{{ 'deadline' | t }} <span class="req">*</span></label>
          <input class="input" type="date" [(ngModel)]="form.deadline" />
        </div>

        <div class="field">
          <label class="label">{{ 'status' | t }}</label>
          <select class="select" [(ngModel)]="form.status">
            @for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
          </select>
        </div>

        <div class="field">
          <label class="label">{{ 'responsible' | t }}</label>
          <select class="select" [(ngModel)]="form.responsibleId">
            <option value="">—</option>
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
        <b style="font-size:13.5px">{{ 'size_breakdown' | t }}</b>
        <div class="row gap-2">
          <span class="badge" [class.badge-success]="sizeTotal() === form.qty" [class.badge-warning]="sizeTotal() !== form.qty">
            {{ sizeTotal() }} / {{ form.qty || 0 }}
          </span>
          <button class="btn btn-sm" type="button" (click)="addSize()"><ui-icon name="plus" [size]="14" /></button>
        </div>
      </div>

      @if (sizes().length) {
        <div class="size-grid">
          @for (s of sizes(); track $index) {
            <div class="size-row">
              <input class="input btn-sm" style="width:64px;height:32px" [(ngModel)]="s.size" placeholder="30" />
              <input class="input btn-sm" style="height:32px" type="number" min="0" [(ngModel)]="s.qty" (ngModelChange)="touch()" />
              <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeSize($index)" [attr.data-tip]="'delete' | t">
                <ui-icon name="x" [size]="14" />
              </button>
            </div>
          }
        </div>
        @if (sizeTotal() !== form.qty && sizeTotal() > 0) {
          <div class="err-text mt-2">{{ 'sizes_mismatch' | t }}</div>
        }
      } @else {
        <div class="small text-3">Razmerlar kiritilmagan — modeldan avtomatik olish uchun modelni tanlang.</div>
      }

      @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }

      <div footer>
        <button class="btn" type="button" (click)="closed.emit()">{{ 'cancel' | t }}</button>
        <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !valid()">
          @if (busy()) { <span class="spinner" style="border-top-color:#fff"></span> } @else { {{ 'save' | t }} }
        </button>
      </div>
    </ui-modal>
  `,
  styles: [`
    .size-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    .size-row { display: flex; align-items: center; gap: 6px; }
  `],
})
export class OrderFormComponent {
  private api = inject(ApiService);

  readonly order = input.required<Partial<Order>>();
  readonly clients = input<Client[]>([]);
  readonly models = input<ProductModel[]>([]);
  readonly saved = output<void>();
  readonly closed = output<void>();

  readonly statuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'LOADING', 'COMPLETED', 'DELAYED', 'CANCELLED'];
  readonly priorities: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

  readonly users = signal<User[]>([]);
  readonly sizes = signal<SizeRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  private version = signal(0);

  form = {
    number: '', clientId: '', modelId: '', qty: 0,
    orderDate: new Date().toISOString().slice(0, 10),
    deadline: '', priority: 'NORMAL' as Priority, status: 'NEW' as OrderStatus,
    note: '', responsibleId: '',
  };

  readonly isNew = computed(() => !this.order()?.id);
  readonly sizeTotal = computed(() => { this.version(); return this.sizes().reduce((a, s) => a + (+s.qty || 0), 0); });
  readonly valid = computed(() => {
    this.version();
    return !!(this.form.number && this.form.qty > 0 && this.form.orderDate && this.form.deadline);
  });

  constructor() {
    queueMicrotask(() => {
      const o = this.order();
      if (o?.id) {
        this.form = {
          number: o.number ?? '',
          clientId: o.client?.id ?? '',
          modelId: o.model?.id ?? '',
          qty: o.qty ?? 0,
          orderDate: (o.orderDate ?? '').slice(0, 10),
          deadline: (o.deadline ?? '').slice(0, 10),
          priority: o.priority ?? 'NORMAL',
          status: o.status ?? 'NEW',
          note: o.note ?? '',
          responsibleId: o.responsible?.id ?? '',
        };
        this.sizes.set((o.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        this.form.deadline = d.toISOString().slice(0, 10);
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
      this.sizes.set(m.sizes.map((s) => ({ size: s.size, qty: 0 })));
    }
    this.touch();
  }

  addSize(): void { this.sizes.update((s) => [...s, { size: '', qty: 0 }]); this.touch(); }
  removeSize(i: number): void { this.sizes.update((s) => s.filter((_, idx) => idx !== i)); this.touch(); }

  save(): void {
    this.busy.set(true);
    this.error.set('');

    const sizes = this.sizes().filter((s) => s.size && s.qty > 0);
    const body: Record<string, unknown> = {
      number: this.form.number.trim(),
      clientId: this.form.clientId || undefined,
      modelId: this.form.modelId || undefined,
      qty: +this.form.qty,
      orderDate: new Date(this.form.orderDate).toISOString(),
      deadline: new Date(this.form.deadline).toISOString(),
      priority: this.form.priority,
      status: this.form.status,
      note: this.form.note || undefined,
      responsibleId: this.form.responsibleId || undefined,
      sizes: sizes.length ? sizes.map((s) => ({ size: s.size, qty: +s.qty })) : undefined,
    };

    const id = this.order()?.id;
    const req = id ? this.api.patch(`/orders/${id}`, body) : this.api.post('/orders', body);

    req.subscribe({
      next: () => { this.busy.set(false); this.saved.emit(); },
      error: (e) => {
        this.busy.set(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(', ') : m || 'Xatolik');
      },
    });
  }
}
