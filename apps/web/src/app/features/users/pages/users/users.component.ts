import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department, Paginated, Role, User, UserAccessLogItem } from '../../../../core/models';
import { deptLabel } from '../../../../core/utils/dept-label';
import { isProtectedUser, isTopAdmin } from '../../../../core/utils/role.util';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { InitialsPipe, ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { PaginationComponent } from '../../../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { FieldErrorsState, runValidation } from '../../../../shared/utils/form-validate';
import { DigitsOnlyDirective } from '../../../../shared/directives/digits-only.directive';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, ShortDatePipe, InitialsPipe, DigitsOnlyDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  search = ''; departmentId = ''; roleId = ''; status = ''; newPassword = '';
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<User> | null>(null);
  readonly roles = signal<Role[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly editing = signal<Partial<User> | null>(null);
  readonly archiving = signal<User | null>(null);
  readonly deleting = signal<User | null>(null);
  readonly passwordFor = signal<User | null>(null);
  readonly accessLogFor = signal<User | null>(null);
  readonly accessLogItems = signal<UserAccessLogItem[]>([]);
  readonly accessLogLoading = signal(false);
  readonly fe = new FieldErrorsState();
  readonly pwdFe = new FieldErrorsState();

  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    const qp = new URLSearchParams(location.search);
    this.search = qp.get('search') ?? '';
    this.reload();
    this.api.get<Role[]>('/roles/assignable').subscribe({ next: (r) => this.roles.set(r), error: () => void 0 });
    this.api.get<Department[]>('/departments').subscribe({ next: (d) => this.departments.set(d), error: () => void 0 });
  }

  deptName(d: Department): string { return deptLabel(d, this.i18n.lang()); }

  isProtectedUser = isProtectedUser;

  canArchiveUser(u: User): boolean {
    const me = this.auth.user();
    return !!me && isTopAdmin(me) && this.auth.can('users.update') && !isProtectedUser(u) && u.id !== me.id;
  }

  canDeleteUser(u: User): boolean {
    const me = this.auth.user();
    return !!me && this.auth.isSuperProAdmin() && !isProtectedUser(u) && u.id !== me.id;
  }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.api.get<Paginated<User>>('/users', {
      page: this.page(), limit: this.limit(), search: this.search,
      departmentId: this.departmentId, roleId: this.roleId, status: this.status,
    }).subscribe({
      next: (d) => { this.data.set(d); this.page.set(d.page); this.limit.set(d.limit); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  open(u: Partial<User>): void {
    this.error.set('');
    this.fe.reset();
    this.form = {
      firstName: u.firstName ?? '', lastName: u.lastName ?? '', phone: u.phone ?? '',
      email: u.email ?? '', login: u.login ?? '', password: '',
      departmentId: u.department?.id ?? '', position: u.position ?? '',
      roleId: u.role?.id ?? '', status: u.status ?? '',
      employeeId: u.employeeId ?? '', lang: u.lang ?? '', note: u.note ?? '',
    };
    this.editing.set(u);
  }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const isNew = !this.editing()?.id;
    if (!this.fe.apply(runValidation([
      { key: 'lastName', label: t('last_name'), value: this.form['lastName'], required: true },
      { key: 'firstName', label: t('first_name'), value: this.form['firstName'], required: true },
      { key: 'phone', label: t('phone'), value: this.form['phone'], required: true },
      { key: 'login', label: t('login'), value: this.form['login'], required: true },
      { key: 'roleId', label: t('role'), value: this.form['roleId'], required: true },
      { key: 'password', label: t('password'), value: this.form['password'], required: isNew },
      { key: 'status', label: t('status'), value: this.form['status'], required: true },
      { key: 'lang', label: t('language'), value: this.form['lang'], required: true },
    ], t))) return;

    this.busy.set(true);
    this.error.set('');
    const body: Record<string, unknown> = { ...this.form };
    if (!body['password']) delete body['password'];
    if (!body['departmentId']) body['departmentId'] = '';
    for (const k of ['email', 'employeeId', 'note', 'position']) if (!body[k]) delete body[k];

    const id = this.editing()?.id;
    const req = id ? this.api.patch(`/users/${id}`, body) : this.api.post('/users', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: (e) => {
        this.busy.set(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  setStatus(u: User, action: 'block' | 'activate'): void {
    this.api.post(`/users/${u.id}/${action}`).subscribe({
      next: () => { this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: () => void 0,
    });
  }

  openPassword(u: User): void { this.newPassword = ''; this.pwdFe.reset(); this.passwordFor.set(u); }

  resetPassword(u: User): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.pwdFe.apply(runValidation([
      { key: 'newPassword', label: t('new_password'), value: this.newPassword, required: true, minLength: 6 },
    ], t))) return;

    this.api.post(`/users/${u.id}/reset-password`, { newPassword: this.newPassword }).subscribe({
      next: () => { this.passwordFor.set(null); this.toast.success(this.i18n.t('saved')); },
      error: () => void 0,
    });
  }

  unlinkTelegram(u: Partial<User>): void {
    this.api.post(`/users/${u.id}/unlink-telegram`).subscribe({
      next: () => { this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: () => void 0,
    });
  }

  archiveUser(u: User): void {
    this.api.post(`/users/${u.id}/archive`, {}).subscribe({
      next: () => { this.archiving.set(null); this.toast.success(this.i18n.t('archived')); this.reload(false); },
      error: (e) => {
        this.archiving.set(null);
        const m = e?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  deleteUser(u: User): void {
    this.api.delete(`/users/${u.id}`).subscribe({
      next: () => { this.deleting.set(null); this.toast.success(this.i18n.t('deleted')); this.reload(false); },
      error: (e) => {
        this.deleting.set(null);
        const m = e?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  openAccessLog(u: User): void {
    this.accessLogFor.set(u);
    this.accessLogItems.set([]);
    this.accessLogLoading.set(true);
    this.api.get<{ items: UserAccessLogItem[] }>(`/users/${u.id}/access-log`).subscribe({
      next: (r) => { this.accessLogItems.set(r.items); this.accessLogLoading.set(false); },
      error: () => { this.accessLogLoading.set(false); this.toast.error(this.i18n.t('error')); },
    });
  }

  closeAccessLog(): void {
    this.accessLogFor.set(null);
    this.accessLogItems.set([]);
  }
}
