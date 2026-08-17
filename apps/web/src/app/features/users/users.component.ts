import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department, Paginated, Role, User } from '../../core/models';
import { deptLabel } from '../../core/dept-label';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { InitialsPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../shared/ui/confirm.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, ShortDatePipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'users_title' | t }}</div>
          <div class="sub">{{ i18n.t('employees_count', { n: data()?.total || 0 }) }}</div>
        </div>
        @if (auth.can('users.create')) {
          <button class="btn btn-primary btn-sm" type="button" (click)="open({})" [attr.data-tip]="'new_user' | t"><ui-icon name="plus" [size]="15" /> {{ 'new_user' | t }}</button>
        }
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <ui-icon name="search" [size]="15" />
            <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
          </div>
          <select class="select" style="width:auto;min-width:160px" [(ngModel)]="departmentId" (ngModelChange)="reload()">
            <option value="">{{ 'department' | t }}: {{ 'all' | t }}</option>
            @for (d of departments(); track d.id) { <option [value]="d.id">{{ deptName(d) }}</option> }
          </select>
          <select class="select" style="width:auto;min-width:150px" [(ngModel)]="roleId" (ngModelChange)="reload()">
            <option value="">{{ 'role' | t }}: {{ 'all' | t }}</option>
            @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
          </select>
          <select class="select" style="width:auto;min-width:140px" [(ngModel)]="status" (ngModelChange)="reload()">
            <option value="">{{ 'status' | t }}: {{ 'all' | t }}</option>
            <option value="ACTIVE">{{ 'st_ACTIVE' | t }}</option>
            <option value="BLOCKED">{{ 'st_BLOCKED_ACCOUNT' | t }}</option>
          </select>
        </div>

        @if (loading()) { <ui-loading /> }
        @else if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap">
              <table class="data">
                <thead><tr>
                  <th>{{ 'full_name' | t }}</th><th>{{ 'phone' | t }}</th><th>{{ 'login' | t }}</th>
                  <th>{{ 'department' | t }}</th><th>{{ 'position' | t }}</th><th>{{ 'role' | t }}</th>
                  <th>{{ 'status' | t }}</th><th>{{ 'telegram' | t }}</th><th>{{ 'last_login' | t }}</th><th class="actions"></th>
                </tr></thead>
                <tbody>
                  @for (u of d.items; track u.id) {
                    <tr>
                      <td>
                        <div class="row gap-3">
                          <span class="avatar sm">{{ u.firstName | initials: u.lastName }}</span>
                          <span class="small bold">{{ u.lastName }} {{ u.firstName }}</span>
                        </div>
                      </td>
                      <td class="mono small">{{ u.phone }}</td>
                      <td class="mono small">{{ u.login }}</td>
                      <td class="small">{{ u.department ? deptName(u.department) : '—' }}</td>
                      <td class="small">{{ u.position || '—' }}</td>
                      <td><span class="badge badge-neutral">{{ u.role?.name }}</span></td>
                      <td><ui-status [value]="u.status === 'BLOCKED' ? 'BLOCKED_ACCOUNT' : u.status" /></td>
                      <td>
                        @if (u.telegramId) { <span class="badge badge-info"><ui-icon name="send" [size]="11" /> {{ u.telegramUsername ? '@' + u.telegramUsername : ('linked_short' | t) }}</span> }
                        @else { <span class="tiny text-3">{{ 'not_linked' | t }}</span> }
                      </td>
                      <td class="small nowrap">{{ u.lastLoginAt ? (u.lastLoginAt | shortDate: true) : ('never' | t) }}</td>
                      <td class="actions">
                        @if (auth.can('users.update')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="open(u)" [attr.data-tip]="'edit' | t"><ui-icon name="pencil" [size]="15" /></button>
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="openPassword(u)" [attr.data-tip]="'reset_password' | t"><ui-icon name="key-round" [size]="15" /></button>
                          @if (u.status === 'ACTIVE') {
                            <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="setStatus(u, 'block')" [attr.data-tip]="'block' | t"><ui-icon name="ban" [size]="15" /></button>
                          } @else {
                            <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="setStatus(u, 'activate')" [attr.data-tip]="'activate' | t"><ui-icon name="check-circle" [size]="15" /></button>
                          }
                        }
                        @if (auth.can('users.delete')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="archiving.set(u)" [attr.data-tip]="'archive' | t"><ui-icon name="archive" [size]="15" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination [page]="d.page" [limit]="d.limit" [total]="d.total" [totalPages]="d.pages"
                           (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); reload()" />
          } @else { <ui-empty icon="users" [title]="'no_data' | t" /> }
        }
      </div>
    </div>

    @if (editing(); as u) {
      <ui-modal size="lg" [title]="u.id ? ('edit_user' | t) : ('new_user' | t)" (closed)="editing.set(null)">
        <div class="form-grid">
          <div class="field" [class.field-invalid]="fe.has('lastName')">
            <label class="label">{{ 'last_name' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="form.lastName" (ngModelChange)="fe.clear('lastName')" />
            @if (fe.get('lastName'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="fe.has('firstName')">
            <label class="label">{{ 'first_name' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="form.firstName" (ngModelChange)="fe.clear('firstName')" />
            @if (fe.get('firstName'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="fe.has('phone')">
            <label class="label">{{ 'phone' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="form.phone" [placeholder]="'phone_placeholder' | t" (ngModelChange)="fe.clear('phone')" />
            @if (fe.get('phone'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field"><label class="label">{{ 'email' | t }}</label><input class="input" type="email" [(ngModel)]="form.email" /></div>
          <div class="field" [class.field-invalid]="fe.has('login')">
            <label class="label">{{ 'login' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="form.login" (ngModelChange)="fe.clear('login')" />
            @if (fe.get('login'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="fe.has('password')">
            <label class="label">{{ 'password' | t }} @if (!u.id) { <span class="req">*</span> } @else { <span class="text-3">({{ 'optional' | t }})</span> }</label>
            <input class="input" type="text" [(ngModel)]="form.password" (ngModelChange)="fe.clear('password')" />
            @if (fe.get('password'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field">
            <label class="label">{{ 'department' | t }}</label>
            <select class="select" [(ngModel)]="form.departmentId"><option value="" disabled hidden>{{ 'select_department' | t }}</option>@for (d of departments(); track d.id) { <option [value]="d.id">{{ deptName(d) }}</option> }</select>
          </div>
          <div class="field"><label class="label">{{ 'position' | t }}</label><input class="input" [(ngModel)]="form.position" /></div>
          <div class="field" [class.field-invalid]="fe.has('roleId')">
            <label class="label">{{ 'role' | t }} <span class="req">*</span></label>
            <select class="select" [(ngModel)]="form.roleId" (ngModelChange)="fe.clear('roleId')"><option value="" disabled hidden>{{ 'select_role' | t }}</option>@for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>
            @if (fe.get('roleId'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field">
            <label class="label">{{ 'status' | t }}</label>
            <select class="select" [(ngModel)]="form.status"><option value="ACTIVE">{{ 'st_ACTIVE' | t }}</option><option value="BLOCKED">{{ 'st_BLOCKED_ACCOUNT' | t }}</option></select>
          </div>
          <div class="field"><label class="label">{{ 'employee_id' | t }}</label><input class="input" [(ngModel)]="form.employeeId" /></div>
          <div class="field">
            <label class="label">{{ 'language' | t }}</label>
            <select class="select" [(ngModel)]="form.lang"><option value="UZ">{{ 'lang_uz' | t }}</option><option value="RU">{{ 'lang_ru' | t }}</option><option value="EN">{{ 'lang_en' | t }}</option></select>
          </div>
          <div class="field full"><label class="label">{{ 'note' | t }}</label><input class="input" [(ngModel)]="form.note" /></div>
        </div>
        @if (u.id && u.telegramId) {
          <div class="divider"></div>
          <div class="row-between">
            <span class="small">{{ 'telegram' | t }}: <b>{{ u.telegramUsername ? '@' + u.telegramUsername : u.telegramId }}</b></span>
            <button class="btn btn-sm" type="button" (click)="unlinkTelegram(u)">{{ 'unlink_telegram' | t }}</button>
          </div>
        }
        @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }
        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    @if (passwordFor(); as u) {
      <ui-modal [title]="'reset_password' | t" [subtitle]="u.lastName + ' ' + u.firstName" (closed)="passwordFor.set(null)">
        <div class="field" [class.field-invalid]="pwdFe.has('newPassword')">
          <label class="label">{{ 'new_password' | t }} <span class="req">*</span></label>
          <input class="input" [(ngModel)]="newPassword" (ngModelChange)="pwdFe.clear('newPassword')" />
          @if (pwdFe.get('newPassword'); as msg) { <div class="field-error">{{ msg }}</div> }
        </div>
        <div class="small text-3 mt-3">{{ 'password_sessions_note' | t }}</div>
        <div footer>
          <button class="btn" type="button" (click)="passwordFor.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="resetPassword(u)">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    @if (archiving(); as u) {
      <ui-confirm [title]="'archive' | t" [message]="i18n.t('user_archive_confirm', { name: u.lastName + ' ' + u.firstName })"
                  [note]="'user_archive_note' | t" [confirmLabel]="'archive' | t"
                  (confirmed)="archive(u)" (cancelled)="archiving.set(null)" />
    }
  `,
})
export class UsersComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  search = ''; departmentId = ''; roleId = ''; status = ''; newPassword = '';
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly data = signal<Paginated<User> | null>(null);
  readonly roles = signal<Role[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly editing = signal<Partial<User> | null>(null);
  readonly archiving = signal<User | null>(null);
  readonly passwordFor = signal<User | null>(null);
  readonly fe = new FieldErrorsState();
  readonly pwdFe = new FieldErrorsState();

  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    const qp = new URLSearchParams(location.search);
    this.search = qp.get('search') ?? '';
    this.reload();
    this.api.get<Role[]>('/roles').subscribe({ next: (r) => this.roles.set(r), error: () => void 0 });
    this.api.get<Department[]>('/departments').subscribe({ next: (d) => this.departments.set(d), error: () => void 0 });
  }

  deptName(d: Department): string { return deptLabel(d, this.i18n.lang()); }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.api.get<Paginated<User>>('/users', {
      page: this.page(), limit: this.limit(), search: this.search,
      departmentId: this.departmentId, roleId: this.roleId, status: this.status,
    }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
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
      roleId: u.role?.id ?? '', status: u.status ?? 'ACTIVE',
      employeeId: u.employeeId ?? '', lang: u.lang ?? 'UZ', note: u.note ?? '',
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

  archive(u: User): void {
    this.api.delete(`/users/${u.id}`).subscribe({
      next: () => { this.archiving.set(null); this.toast.success(this.i18n.t('archived')); this.reload(false); },
      error: () => this.archiving.set(null),
    });
  }
}
