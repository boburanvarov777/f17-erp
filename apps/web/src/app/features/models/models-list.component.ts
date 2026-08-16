import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Client, ModelSize, Paginated, ProductModel } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../shared/ui/confirm.component';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-models-list',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'models_title' | t }}</div>
          <div class="sub">{{ data()?.total || 0 }} ta model</div>
        </div>
        <div class="row gap-2">
          <div class="seg">
            <button type="button" [class.on]="view() === 'grid'" (click)="view.set('grid')" [attr.data-tip]="'view_grid' | t"><ui-icon name="layout-dashboard" [size]="15" /></button>
            <button type="button" [class.on]="view() === 'table'" (click)="view.set('table')" [attr.data-tip]="'view_table' | t"><ui-icon name="list-checks" [size]="15" /></button>
          </div>
          @if (auth.can('models.create')) {
            <button class="btn btn-primary btn-sm" type="button" (click)="open({})" [attr.data-tip]="'new_model' | t"><ui-icon name="plus" [size]="15" /> {{ 'new_model' | t }}</button>
          }
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <ui-icon name="search" [size]="15" />
            <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
          </div>
          <select class="select" style="width:auto;min-width:150px" [(ngModel)]="clientId" (ngModelChange)="reload()">
            <option value="">{{ 'client' | t }}: {{ 'all' | t }}</option>
            @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
          <select class="select" style="width:auto;min-width:140px" [(ngModel)]="status" (ngModelChange)="reload()">
            <option value="">{{ 'status' | t }}: {{ 'all' | t }}</option>
            <option value="ACTIVE">{{ 'st_ACTIVE' | t }}</option>
            <option value="DRAFT">{{ 'st_DRAFT' | t }}</option>
            <option value="ARCHIVED">{{ 'st_ARCHIVED' | t }}</option>
          </select>
        </div>

        @if (loading()) { <ui-loading /> }
        @else if (data(); as d) {
          @if (!d.items.length) {
            <ui-empty icon="shirt" [title]="'no_models' | t" />
          } @else if (view() === 'grid') {
            <div class="mgrid">
              @for (m of d.items; track m.id) {
                <a class="mcard" [routerLink]="['/models', m.id]">
                  <div class="mphoto">
                    @if (m.photo) { <img [src]="m.photo" [alt]="m.name" /> } @else { <ui-icon name="shirt" [size]="34" [stroke]="1.2" /> }
                  </div>
                  <div class="mbody">
                    <div class="row-between gap-2">
                      <b class="mono">{{ m.code }}</b>
                      <ui-status [value]="m.status" />
                    </div>
                    <div class="small truncate">{{ m.name }}</div>
                    <div class="tiny text-3 truncate">{{ m.client?.name || '—' }} · {{ m.category || '—' }}</div>
                    <div class="row-between tiny text-3 mt-2">
                      <span>{{ m.sizes?.length || 0 }} razmer</span>
                      <span>{{ m._count?.orders || 0 }} zakaz</span>
                    </div>
                  </div>
                </a>
              }
            </div>
          } @else {
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>{{ 'model_code' | t }}</th><th>{{ 'model_name' | t }}</th><th>{{ 'category' | t }}</th><th>{{ 'client' | t }}</th><th>{{ 'color' | t }}</th><th>{{ 'season' | t }}</th><th>{{ 'status' | t }}</th><th class="num">{{ 'orders_count' | t }}</th><th class="actions"></th></tr></thead>
                <tbody>
                  @for (m of d.items; track m.id) {
                    <tr class="clickable" [routerLink]="['/models', m.id]">
                      <td><b class="mono">{{ m.code }}</b></td>
                      <td>{{ m.name }}</td>
                      <td class="small">{{ m.category || '—' }}</td>
                      <td class="small">{{ m.client?.name || '—' }}</td>
                      <td class="small">{{ m.color || '—' }}</td>
                      <td class="small">{{ m.season || '—' }}</td>
                      <td><ui-status [value]="m.status" /></td>
                      <td class="num">{{ m._count?.orders || 0 }}</td>
                      <td class="actions" (click)="$event.stopPropagation()">
                        @if (auth.can('models.update')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="open(m)" [attr.data-tip]="'edit' | t"><ui-icon name="pencil" [size]="15" /></button>
                        }
                        @if (auth.can('models.delete')) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="archiving.set(m)" [attr.data-tip]="'archive' | t"><ui-icon name="archive" [size]="15" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <ui-pagination [page]="d.page" [limit]="d.limit" [total]="d.total" [totalPages]="d.pages"
                         (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); reload()" />
        }
      </div>
    </div>

    @if (editing(); as m) {
      <ui-modal size="lg" [title]="m.id ? ('edit' | t) : ('new_model' | t)" (closed)="editing.set(null)">
        <div class="form-grid">
          <div class="field"><label class="label">{{ 'model_code' | t }} <span class="req">*</span></label><input class="input mono" [(ngModel)]="form.code" /></div>
          <div class="field"><label class="label">{{ 'model_name' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="form.name" /></div>
          <div class="field"><label class="label">{{ 'category' | t }}</label><input class="input" [(ngModel)]="form.category" /></div>
          <div class="field"><label class="label">{{ 'season' | t }}</label><input class="input" [(ngModel)]="form.season" placeholder="SS-26" /></div>
          <div class="field"><label class="label">{{ 'color' | t }}</label><input class="input" [(ngModel)]="form.color" /></div>
          <div class="field">
            <label class="label">{{ 'client' | t }}</label>
            <select class="select" [(ngModel)]="form.clientId"><option value="">—</option>@for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
          </div>
          <div class="field full"><label class="label">{{ 'fabric' | t }}</label><input class="input" [(ngModel)]="form.fabric" /></div>
          <div class="field"><label class="label">{{ 'lining' | t }}</label><input class="input" [(ngModel)]="form.lining" /></div>
          <div class="field"><label class="label">{{ 'cost' | t }}</label><input class="input" type="number" [(ngModel)]="form.cost" /></div>
          <div class="field full"><label class="label">{{ 'photo' | t }} (URL)</label><input class="input" [(ngModel)]="form.photo" /></div>
          <div class="field full"><label class="label">{{ 'description' | t }}</label><textarea class="textarea" rows="2" [(ngModel)]="form.description"></textarea></div>
        </div>

        <div class="divider"></div>
        <div class="row-between mb-3">
          <b style="font-size:13.5px">{{ 'sizes' | t }}</b>
          <button class="btn btn-sm" type="button" (click)="addSize()"><ui-icon name="plus" [size]="14" /></button>
        </div>
        <div class="size-grid">
          @for (s of sizes(); track $index) {
            <div class="row gap-2">
              <input class="input btn-sm" style="width:64px;height:32px" [(ngModel)]="s.size" />
              <input class="input btn-sm" style="height:32px" type="number" [(ngModel)]="s.qty" />
              <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeSize($index)" [attr.data-tip]="'delete' | t"><ui-icon name="x" [size]="14" /></button>
            </div>
          }
        </div>

        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !form.code || !form.name">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    @if (archiving(); as m) {
      <ui-confirm [title]="'archive' | t" [message]="'«' + m.code + '» modelini arxivlaysizmi?'"
                  [note]="'model_archive_note' | t" [confirmLabel]="'archive' | t"
                  (confirmed)="archive(m)" (cancelled)="archiving.set(null)" />
    }
  `,
  styles: [`
    .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--r); overflow: hidden; }
    .seg button { border: none; background: var(--surface); padding: 7px 11px; cursor: pointer; color: var(--text-3); }
    .seg button.on { background: var(--primary); color: #fff; }
    .mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; padding: 16px; }
    .mcard { border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; text-decoration: none; color: inherit; background: var(--surface); transition: box-shadow .15s ease, transform .15s ease; }
    .mcard:hover { box-shadow: var(--sh-2); transform: translateY(-2px); text-decoration: none; }
    .mphoto { height: 148px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; color: var(--text-3); }
    .mphoto img { width: 100%; height: 100%; object-fit: cover; }
    .mbody { padding: 11px 12px; display: flex; flex-direction: column; gap: 3px; }
    .size-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  `],
})
export class ModelsListComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  search = ''; clientId = ''; status = '';
  readonly view = signal<'grid' | 'table'>((localStorage.getItem('f17_models_view') as 'grid' | 'table') || 'grid');
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly data = signal<Paginated<ProductModel> | null>(null);
  readonly clients = signal<Client[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly editing = signal<Partial<ProductModel> | null>(null);
  readonly archiving = signal<ProductModel | null>(null);
  readonly sizes = signal<ModelSize[]>([]);

  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.api.get<Client[]>('/clients').subscribe({ next: (c) => this.clients.set(c), error: () => void 0 });
  }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    localStorage.setItem('f17_models_view', this.view());
    this.loading.set(true);
    this.api.get<Paginated<ProductModel>>('/models', {
      page: this.page(), limit: this.limit(), search: this.search, clientId: this.clientId, status: this.status,
    }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  open(m: Partial<ProductModel>): void {
    this.form = {
      code: m.code ?? '', name: m.name ?? '', category: m.category ?? '', season: m.season ?? '',
      color: m.color ?? '', clientId: m.client?.id ?? '', fabric: m.fabric ?? '', lining: m.lining ?? '',
      cost: m.cost ? +m.cost : null, photo: m.photo ?? '', description: m.description ?? '',
    };
    this.sizes.set((m.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
    this.editing.set(m);
  }

  addSize(): void { this.sizes.update((s) => [...s, { size: '', qty: 0 }]); }
  removeSize(i: number): void { this.sizes.update((s) => s.filter((_, idx) => idx !== i)); }

  save(): void {
    this.busy.set(true);
    const body: Record<string, unknown> = { ...this.form };
    if (!body['clientId']) delete body['clientId'];
    if (body['cost'] == null) delete body['cost'];
    const sizes = this.sizes().filter((s) => s.size);
    if (sizes.length) body['sizes'] = sizes.map((s) => ({ size: s.size, qty: +s.qty || 0 }));

    const id = this.editing()?.id;
    const req = id ? this.api.patch(`/models/${id}`, body) : this.api.post('/models', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.reload(false); },
      error: () => this.busy.set(false),
    });
  }

  archive(m: ProductModel): void {
    this.api.delete(`/models/${m.id}`).subscribe({
      next: () => { this.archiving.set(null); this.toast.success(this.i18n.t('archived')); this.reload(false); },
      error: () => this.archiving.set(null),
    });
  }
}
