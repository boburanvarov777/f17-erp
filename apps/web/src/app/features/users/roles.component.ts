import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Role } from '../../core/models';
import { permActionKey, permModuleKey } from '../../core/permission-i18n';
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

const SUPER_PRO_ADMIN = 'SUPER_PRO_ADMIN';

@Component({
  selector: 'app-roles',
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly lang = this.i18n.lang;
  readonly permModuleKey = permModuleKey;
  readonly permActionKey = permActionKey;

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

  isFullAccessRole(r: Partial<Role>): boolean {
    return r.code === SUPER_PRO_ADMIN;
  }

  canEdit(r: Partial<Role>): boolean {
    return r.code !== SUPER_PRO_ADMIN;
  }

  canEditFields(r: Partial<Role>): boolean {
    return this.canEdit(r);
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Role[]>('/roles').subscribe({
      next: (r) => { this.roles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  groupsOf(r: Role): { key: string; count: number }[] {
    const m = new Map<string, number>();
    for (const p of r.permissions) {
      if (p === '*') continue;
      const g = p.split('.')[0];
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, count }));
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
