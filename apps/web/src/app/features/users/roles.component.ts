import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Role } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [FormsModule, IconComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'roles_title' | t }}</div>
          <div class="sub">{{ i18n.t('roles_count_sub', { n: roles().length }) }}</div>
        </div>
        @if (auth.can('roles.create')) {
          <button class="btn btn-primary btn-sm" type="button" (click)="open({ permissions: [] })" [attr.data-tip]="'new_role' | t"><ui-icon name="plus" [size]="15" /> {{ 'new_role' | t }}</button>
        }
      </div>

      @if (loading()) { <ui-loading [count]="4" [height]="70" /> }
      @else {
        <div class="rgrid">
          @for (r of roles(); track r.id) {
            <div class="card card-pad">
              <div class="row-between mb-3">
                <div>
                  <div class="row gap-2">
                    <b>{{ r.name }}</b>
                    @if (r.isSystem) { <span class="badge badge-neutral">{{ 'system_role' | t }}</span> }
                  </div>
                  <div class="tiny text-3 mono">{{ r.code }}</div>
                </div>
                <span class="badge badge-info">{{ (r._count?.users || 0) | num }} {{ 'users_in_role' | t }}</span>
              </div>
              @if (r.description) { <div class="small text-2 mb-3">{{ r.description }}</div> }

              @if (r.permissions.includes('*')) {
                <span class="badge badge-danger"><ui-icon name="shield-check" [size]="12" /> {{ 'full_access' | t }}</span>
              } @else {
                <div class="row gap-1 wrap">
                  @for (g of groupsOf(r); track g.name) {
                    <span class="badge badge-neutral">{{ g.name }} · {{ g.count | num }}</span>
                  }
                </div>
              }

              <div class="row gap-2 mt-4">
                <button class="btn btn-sm" type="button" (click)="open(r)" [attr.data-tip]="r.isSystem ? ('view' | t) : ('edit' | t)">
                  <ui-icon name="eye" [size]="14" /> {{ r.isSystem ? ('view' | t) : ('edit' | t) }}
                </button>
                @if (!r.isSystem && auth.can('roles.delete')) {
                  <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="remove(r)" [attr.data-tip]="'delete' | t"><ui-icon name="trash" [size]="14" /></button>
                }
              </div>
            </div>
          } @empty { <ui-empty icon="shield-check" [title]="'no_data' | t" /> }
        </div>
      }
    </div>

    @if (editing(); as r) {
      <ui-modal size="lg" [title]="r.id ? r.name || '' : ('new_role' | t)" [subtitle]="'permissions' | t" (closed)="editing.set(null)">
        <div class="form-grid mb-4">
          <div class="field" [class.field-invalid]="fe.has('code')">
            <label class="label">{{ 'code' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="form.code" [disabled]="!!r.id" (ngModelChange)="fe.clear('code')" />
            @if (fe.get('code'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="fe.has('name')">
            <label class="label">{{ 'role_name' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="form.name" (ngModelChange)="fe.clear('name')" />
            @if (fe.get('name'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field full"><label class="label">{{ 'description' | t }}</label><input class="input" [(ngModel)]="form.description" /></div>
        </div>

        @if (r.permissions?.includes('*')) {
          <div class="badge badge-danger" style="width:100%;justify-content:flex-start;padding:11px;border-radius:var(--r)">
            <ui-icon name="shield-check" [size]="15" /> {{ 'full_access' | t }} — {{ 'roles_full_access_desc' | t }}
          </div>
        } @else {
          @for (g of permissionGroups(); track g.key) {
            <div class="pgroup">
              <div class="row-between mb-2">
                <b class="small">{{ g.key }}</b>
                <label class="checkbox">
                  <input type="checkbox" [checked]="allChecked(g.items)" (change)="toggleGroup(g.items, $any($event.target).checked)" [disabled]="r.isSystem" />
                  <span class="tiny">{{ 'all' | t }}</span>
                </label>
              </div>
              <div class="pchips">
                @for (p of g.items; track p) {
                  <label class="checkbox pchip" [class.on]="selected().has(p)">
                    <input type="checkbox" [checked]="selected().has(p)" (change)="toggle(p)" [disabled]="r.isSystem" />
                    <span>{{ p.split('.')[1] }}</span>
                  </label>
                }
              </div>
            </div>
          }
        }

        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'close' | t }}</button>
          @if (!r.isSystem && auth.can('roles.update', 'roles.create')) {
            <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy()">{{ 'save' | t }}</button>
          }
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .rgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
    .pgroup { border: 1px solid var(--border); border-radius: var(--r); padding: 12px 14px; margin-bottom: 10px; background: var(--surface-2); }
    .pchips { display: flex; gap: 6px; flex-wrap: wrap; }
    .pchip { padding: 4px 10px; border: 1px solid var(--border-strong); border-radius: 100px; background: var(--surface); font-size: 12px; }
    .pchip.on { background: var(--primary-50); border-color: var(--primary-500); color: var(--primary); font-weight: 600; }
  `],
})
export class RolesComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly roles = signal<Role[]>([]);
  readonly allPermissions = signal<Record<string, string[]>>({});
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly editing = signal<Partial<Role> | null>(null);
  readonly selected = signal<Set<string>>(new Set());
  readonly fe = new FieldErrorsState();
  form: Record<string, any> = {};

  readonly permissionGroups = computed(() =>
    Object.entries(this.allPermissions()).map(([key, items]) => ({ key, items })),
  );

  constructor() {
    this.load();
    this.api.get<{ groups: Record<string, string[]> }>('/roles/permissions').subscribe({
      next: (r) => this.allPermissions.set(r.groups), error: () => void 0,
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Role[]>('/roles').subscribe({
      next: (r) => { this.roles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  groupsOf(r: Role): { name: string; count: number }[] {
    const m = new Map<string, number>();
    for (const p of r.permissions) {
      const g = p.split('.')[0];
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count }));
  }

  open(r: Partial<Role>): void {
    this.fe.reset();
    this.form = { code: r.code ?? '', name: r.name ?? '', description: r.description ?? '' };
    this.selected.set(new Set(r.permissions ?? []));
    this.editing.set(r);
  }

  toggle(p: string): void {
    this.selected.update((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  }

  allChecked(items: string[]): boolean { return items.every((i) => this.selected().has(i)); }

  toggleGroup(items: string[], on: boolean): void {
    this.selected.update((s) => {
      const n = new Set(s);
      for (const i of items) on ? n.add(i) : n.delete(i);
      return n;
    });
  }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'code', label: t('code'), value: this.form['code'], required: true },
      { key: 'name', label: t('role_name'), value: this.form['name'], required: true },
    ], t))) return;

    this.busy.set(true);
    const body = { ...this.form, permissions: [...this.selected()] };
    const id = this.editing()?.id;
    const req = id ? this.api.patch(`/roles/${id}`, body) : this.api.post('/roles', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.load(); },
      error: () => this.busy.set(false),
    });
  }

  remove(r: Role): void {
    this.api.delete(`/roles/${r.id}`).subscribe({
      next: () => { this.toast.success(this.i18n.t('deleted')); this.load(); },
      error: () => void 0,
    });
  }
}
