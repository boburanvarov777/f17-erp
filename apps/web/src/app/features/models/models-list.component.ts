import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap, catchError, map } from 'rxjs';
import type { Accessory, Client, ModelColor, ModelPhoto, ModelSize, Paginated, ProductModel } from '../../core/models';
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
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { SizeRowFieldsComponent } from '../../shared/components/size-row-fields.component';

@Component({
  selector: 'app-models-list',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, GroupedNumberDirective, SizeRowFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'models_title' | t }}</div>
          <div class="sub">{{ i18n.t('models_count', { n: data()?.total || 0 }) }}</div>
        </div>
        <div class="page-actions">
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
                <div class="mcard">
                  <a class="mcard-link" [routerLink]="['/models', m.id]">
                    <div class="mphoto">
                      @if (coverPhoto(m); as src) { <img [src]="src" [alt]="m.name" /> } @else { <ui-icon name="shirt" [size]="34" [stroke]="1.2" /> }
                    </div>
                    <div class="mbody">
                      <div class="row-between gap-2">
                        <b class="mono">{{ m.code }}</b>
                        <ui-status [value]="m.status" />
                      </div>
                      <div class="small truncate">{{ m.name }}</div>
                      <div class="tiny text-3 truncate">{{ m.client?.name || '—' }} · {{ m.category || '—' }}</div>
                      <div class="row-between tiny text-3 mt-2">
                        <span>{{ 'model_sizes_short' | t: { n: m.sizes?.length || 0 } }}</span>
                        <span>{{ 'model_orders_short' | t: { n: m._count?.orders || 0 } }}</span>
                      </div>
                    </div>
                  </a>
                  @if (auth.can('models.update')) {
                    <button class="mcard-edit" type="button" (click)="open(m)" [attr.data-tip]="'edit' | t">
                      <ui-icon name="pencil" [size]="14" />
                    </button>
                  }
                </div>
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
          <ui-pagination [page]="page()" [limit]="limit()" [total]="d.total" [totalPages]="d.pages"
                         (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); page.set(1); reload(false)" />
        }
      </div>
    </div>

    @if (editing(); as m) {
      <ui-modal size="lg" [title]="m.id ? ('edit' | t) : ('new_model' | t)" (closed)="editing.set(null)">
        <div class="form-grid">
          <div class="field" [class.field-invalid]="fe.has('code')">
            <label class="label">{{ 'model_code' | t }} <span class="req">*</span></label>
            <input class="input mono" [(ngModel)]="form.code" (ngModelChange)="fe.clear('code')" />
            @if (fe.get('code'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field" [class.field-invalid]="fe.has('name')">
            <label class="label">{{ 'model_name' | t }} <span class="req">*</span></label>
            <input class="input" [(ngModel)]="form.name" (ngModelChange)="fe.clear('name')" />
            @if (fe.get('name'); as msg) { <div class="field-error">{{ msg }}</div> }
          </div>
          <div class="field"><label class="label">{{ 'category' | t }}</label><input class="input" [(ngModel)]="form.category" /></div>
          <div class="field"><label class="label">{{ 'season' | t }}</label><input class="input" [(ngModel)]="form.season" [placeholder]="'season_placeholder' | t" /></div>
          <div class="field"><label class="label">{{ 'color' | t }}</label><input class="input" [(ngModel)]="form.color" /></div>
          <div class="field">
            <label class="label">{{ 'client' | t }}</label>
            <select class="select" [(ngModel)]="form.clientId"><option value="" disabled>{{ 'select_client' | t }}</option>@for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
          </div>
          <div class="field full"><label class="label">{{ 'fabric' | t }}</label><input class="input" [(ngModel)]="form.fabric" /></div>
          <div class="field"><label class="label">{{ 'lining' | t }}</label><input class="input" [(ngModel)]="form.lining" /></div>
          <div class="field"><label class="label">{{ 'cost' | t }}</label><input class="input" type="number" [(ngModel)]="form.cost" /></div>
          <div class="field full">
            <label class="label">
              {{ 'photo' | t }}
              @if (photoCount()) {
                <span class="photo-count">{{ i18n.t('photo_count', { n: photoCount() }) }}</span>
              }
            </label>
            <div class="photo-zone">
              <input #photoInput type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden (change)="onPhotoSelected($event)" />
              <div class="photo-grid">
                @for (p of existingPhotos(); track p.id) {
                  <div class="photo-card">
                    <img [src]="p.url" [alt]="form.name || 'model'" />
                    <button class="photo-del" type="button" (click)="removeExistingPhoto(p.id)" [attr.data-tip]="'photo_remove' | t">
                      <ui-icon name="trash" [size]="14" />
                    </button>
                  </div>
                }
                @for (p of pendingPreviews(); track p.key) {
                  <div class="photo-card pending">
                    <img [src]="p.url" [alt]="form.name || 'model'" />
                    @if (p.uploading) {
                      <div class="photo-loading"><span class="spinner"></span></div>
                    }
                    <button class="photo-del" type="button" (click)="removePendingPhoto(p.key)" [disabled]="p.uploading" [attr.data-tip]="'photo_remove' | t">
                      <ui-icon name="trash" [size]="14" />
                    </button>
                  </div>
                }
                <button class="photo-add" type="button" (click)="photoInput.click()" [disabled]="photoUploading()" [attr.data-tip]="'upload_photo' | t">
                  @if (photoUploading()) {
                    <span class="spinner"></span>
                    <span>{{ 'photo_uploading' | t }}</span>
                  } @else {
                    <ui-icon name="plus" [size]="22" />
                    <span>{{ 'upload_photo' | t }}</span>
                  }
                </button>
              </div>
              <div class="tiny text-3">{{ 'photo_hint' | t }}</div>
            </div>
          </div>
          <div class="field full"><label class="label">{{ 'description' | t }}</label><textarea class="textarea" rows="2" [(ngModel)]="form.description"></textarea></div>
        </div>

        <div class="divider"></div>
        <div class="row-between mb-3">
          <b style="font-size:13.5px">{{ 'sizes' | t }}</b>
          <button class="btn btn-sm" type="button" (click)="addSize()"><ui-icon name="plus" [size]="14" /></button>
        </div>
        <div class="size-list">
          @for (s of sizes(); track $index) {
            <app-size-row-fields [row]="s" (changed)="touchSizes()">
              <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeSize($index)" [attr.data-tip]="'delete' | t">
                <ui-icon name="x" [size]="14" />
              </button>
            </app-size-row-fields>
          }
        </div>
        @if (!sizes().length) { <div class="tiny text-3 mt-2">{{ 'model_sizes_hint' | t }}</div> }

        <div class="divider"></div>
        <div class="row-between mb-3">
          <b style="font-size:13.5px">{{ 'colors' | t }}</b>
          <button class="btn btn-sm" type="button" (click)="addColor()"><ui-icon name="plus" [size]="14" /></button>
        </div>
        <div class="color-grid">
          @for (c of colors(); track $index) {
            <div class="row gap-2">
              <input class="input btn-sm" style="width:28px;height:32px;padding:2px" type="color" [(ngModel)]="c.hex" />
              <input class="input btn-sm" style="flex:1;height:32px" [(ngModel)]="c.name" [placeholder]="'color' | t" />
              <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeColor($index)" [attr.data-tip]="'delete' | t"><ui-icon name="x" [size]="14" /></button>
            </div>
          }
        </div>
        @if (!colors().length) { <div class="tiny text-3 mt-2">{{ 'model_colors_hint' | t }}</div> }

        <div class="divider"></div>
        <div class="row-between mb-3">
          <b style="font-size:13.5px">{{ 'accessories' | t }}</b>
          <button class="btn btn-sm" type="button" (click)="addAccessory()"><ui-icon name="plus" [size]="14" /></button>
        </div>
        @if (accessories().length) {
          <div class="acc-grid">
            @for (a of accessories(); track $index) {
              <div class="acc-row">
                <input class="input btn-sm" [(ngModel)]="a.name" [placeholder]="'material' | t" />
                <input class="input btn-sm" [(ngModel)]="a.color" [placeholder]="'color' | t" />
                <input class="input btn-sm" style="width:64px" [(ngModel)]="a.size" [placeholder]="'size_label' | t" />
                <input class="input btn-sm mono" [(ngModel)]="a.code" [placeholder]="'code' | t" />
                <input class="input btn-sm" style="width:72px" groupedNumber [(ngModel)]="a.qty" [placeholder]="'quantity' | t" />
                <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="removeAccessory($index)" [attr.data-tip]="'delete' | t"><ui-icon name="x" [size]="14" /></button>
              </div>
            }
          </div>
        } @else {
          <div class="tiny text-3">{{ 'model_accessories_hint' | t }}</div>
        }

        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }

    @if (archiving(); as m) {
      <ui-confirm [title]="'archive' | t" [message]="i18n.t('model_archive_confirm', { name: m.code })"
                  [note]="'model_archive_note' | t" [confirmLabel]="'archive' | t"
                  (confirmed)="archive(m)" (cancelled)="archiving.set(null)" />
    }
  `,
  styles: [`
    .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--r); overflow: hidden; }
    .seg button { border: none; background: var(--surface); padding: 7px 11px; cursor: pointer; color: var(--text-3); }
    .seg button.on { background: var(--primary); color: #fff; }
    .mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; padding: 16px; }
    .mcard { position: relative; border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; background: var(--surface); transition: box-shadow .15s ease, transform .15s ease; }
    .mcard:hover { box-shadow: var(--sh-2); transform: translateY(-2px); }
    .mcard-link { display: block; text-decoration: none; color: inherit; }
    .mcard-link:hover { text-decoration: none; }
    .mcard-edit {
      position: absolute; top: 8px; right: 8px; z-index: 2;
      width: 32px; height: 32px; border: none; border-radius: 50%;
      background: var(--surface); color: var(--text-2); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.18); transition: background .12s ease, color .12s ease, transform .12s ease;
    }
    .mcard-edit:hover { background: var(--primary); color: #fff; transform: scale(1.05); }
    .mphoto { height: 148px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; color: var(--text-3); }
    .mphoto img { width: 100%; height: 100%; object-fit: cover; }
    .mbody { padding: 11px 12px; display: flex; flex-direction: column; gap: 3px; }
    .size-list { display: flex; flex-direction: column; gap: 10px; }
    .color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
    .acc-grid { display: flex; flex-direction: column; gap: 8px; }
    .acc-row { display: grid; grid-template-columns: 1.2fr 1fr 64px 1fr 72px 32px; gap: 6px; align-items: center; }
    @media (max-width: 720px) { .acc-row { grid-template-columns: 1fr 1fr; } }
    .photo-count { margin-left: 6px; font-weight: 500; color: var(--text-3); font-size: 12px; }
    .photo-zone { display: flex; flex-direction: column; gap: 8px; }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
      gap: 10px;
      width: 100%;
    }
    .photo-card {
      position: relative; aspect-ratio: 1; border-radius: var(--r); border: 1px solid var(--border-strong);
      background: var(--surface-3); overflow: hidden;
    }
    .photo-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .photo-card.pending { box-shadow: 0 0 0 2px var(--primary-bg); }
    .photo-loading {
      position: absolute; inset: 0; background: rgba(255,255,255,.72);
      display: flex; align-items: center; justify-content: center;
    }
    .photo-del {
      position: absolute; bottom: 6px; right: 6px; width: 28px; height: 28px; border: none; border-radius: var(--r);
      background: var(--danger); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.25); transition: filter .12s ease;
    }
    .photo-del:hover:not(:disabled) { filter: brightness(1.1); }
    .photo-del:disabled { opacity: .55; cursor: not-allowed; }
    .photo-add {
      aspect-ratio: 1; min-height: 108px; border: 2px dashed var(--border-strong); border-radius: var(--r);
      background: var(--surface-2); color: var(--text-3); cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      font-size: 11px; line-height: 1.2; padding: 8px; transition: border-color .12s ease, color .12s ease;
    }
    .photo-add:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
    .photo-add:disabled { opacity: .6; cursor: wait; }
  `],
})
export class ModelsListComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  search = ''; clientId = ''; status = '';
  readonly view = signal<'grid' | 'table'>((localStorage.getItem('f17_models_view') as 'grid' | 'table') || 'grid');
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<ProductModel> | null>(null);
  readonly clients = signal<Client[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly editing = signal<Partial<ProductModel> | null>(null);
  readonly archiving = signal<ProductModel | null>(null);
  readonly sizes = signal<{ size: string; qty: number | null }[]>([]);
  readonly colors = signal<{ name: string; hex: string }[]>([]);
  readonly accessories = signal<{ name: string; color: string; size: string; code: string; qty: number | null }[]>([]);
  readonly existingPhotos = signal<ModelPhoto[]>([]);
  readonly pendingPreviews = signal<{ key: string; url: string; file: File; uploading?: boolean }[]>([]);
  readonly removedPhotoIds = signal<string[]>([]);
  readonly photoUploading = signal(false);
  readonly photoCount = computed(() => this.existingPhotos().length + this.pendingPreviews().length);
  readonly fe = new FieldErrorsState();

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
    }, { noCache: true }).subscribe({
      next: (d) => { this.data.set(d); this.page.set(d.page); this.limit.set(d.limit); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  coverPhoto(m: ProductModel): string | null {
    return m.photo || m.photos?.[0]?.url || null;
  }

  open(m: Partial<ProductModel>): void {
    this.fe.reset();
    this.form = {
      code: m.code ?? '', name: m.name ?? '', category: m.category ?? '', season: m.season ?? '',
      color: m.color ?? '', clientId: m.client?.id ?? '', fabric: m.fabric ?? '', lining: m.lining ?? '',
      cost: m.cost ? +m.cost : null, description: m.description ?? '',
    };
    this.revokePendingPreviews();
    this.removedPhotoIds.set([]);
    this.photoUploading.set(false);
    this.sizes.set([]);
    this.colors.set([]);
    this.accessories.set([]);
    this.editing.set(m);
    if (m.id) {
      this.api.get<ProductModel>(`/models/${m.id}`).subscribe({
        next: (full) => {
          this.existingPhotos.set(full.photos ?? []);
          this.sizes.set((full.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
          this.colors.set((full.colors ?? []).map((c) => ({ name: c.name, hex: c.hex || '#cccccc' })));
          this.accessories.set((full.accessories ?? []).map((a) => ({
            name: a.name, color: a.color ?? '', size: a.size ?? '', code: a.code ?? '', qty: a.qty ?? null,
          })));
        },
        error: () => {
          this.existingPhotos.set([]);
          this.sizes.set((m.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
        },
      });
    } else {
      this.existingPhotos.set([]);
    }
  }

  onPhotoSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const valid: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
        this.toast.error(this.i18n.t('photo_hint'));
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;

    const modelId = this.editing()?.id;
    if (modelId) {
      this.uploadPhotosNow(modelId, valid);
      return;
    }

    this.pendingPreviews.update((p) => [
      ...p,
      ...valid.map((f) => ({ key: crypto.randomUUID(), url: URL.createObjectURL(f), file: f })),
    ]);
  }

  private uploadPhotosNow(modelId: string, files: File[]): void {
    this.photoUploading.set(true);
    const entries = files.map((f) => ({
      key: crypto.randomUUID(),
      url: URL.createObjectURL(f),
      file: f,
      uploading: true,
    }));
    this.pendingPreviews.update((p) => [...p, ...entries]);

    forkJoin(files.map((f) => this.api.upload<ModelPhoto>(`/models/${modelId}/photos`, f))).subscribe({
      next: (photos) => {
        for (const e of entries) URL.revokeObjectURL(e.url);
        this.pendingPreviews.update((p) => p.filter((x) => !entries.some((e) => e.key === x.key)));
        this.existingPhotos.update((p) => [...p, ...photos]);
        this.photoUploading.set(false);
      },
      error: (err) => {
        for (const e of entries) URL.revokeObjectURL(e.url);
        this.pendingPreviews.update((p) => p.filter((x) => !entries.some((e) => e.key === x.key)));
        this.photoUploading.set(false);
        const m = err?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  removeExistingPhoto(id: string): void {
    const modelId = this.editing()?.id;
    this.existingPhotos.update((p) => p.filter((x) => x.id !== id));
    if (modelId) {
      this.api.delete(`/models/photos/${id}`).subscribe({ error: () => this.toast.error(this.i18n.t('error')) });
      return;
    }
    this.removedPhotoIds.update((ids) => [...ids, id]);
  }

  removePendingPhoto(key: string): void {
    const item = this.pendingPreviews().find((p) => p.key === key);
    if (item) URL.revokeObjectURL(item.url);
    this.pendingPreviews.update((p) => p.filter((x) => x.key !== key));
  }

  private revokePendingPreviews(): void {
    for (const p of this.pendingPreviews()) URL.revokeObjectURL(p.url);
    this.pendingPreviews.set([]);
  }

  addSize(): void { this.sizes.update((s) => [...s, { size: '', qty: null }]); }
  removeSize(i: number): void { this.sizes.update((s) => s.filter((_, idx) => idx !== i)); }
  touchSizes(): void { this.sizes.update((s) => [...s]); }
  addColor(): void { this.colors.update((c) => [...c, { name: '', hex: '#cccccc' }]); }
  removeColor(i: number): void { this.colors.update((c) => c.filter((_, idx) => idx !== i)); }
  addAccessory(): void { this.accessories.update((a) => [...a, { name: '', color: '', size: '', code: '', qty: null }]); }
  removeAccessory(i: number): void { this.accessories.update((a) => a.filter((_, idx) => idx !== i)); }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'code', label: t('model_code'), value: this.form['code'], required: true },
      { key: 'name', label: t('model_name'), value: this.form['name'], required: true },
    ], t))) return;

    this.busy.set(true);
    const body: Record<string, unknown> = { ...this.form };
    if (!body['clientId']) delete body['clientId'];
    if (body['cost'] == null) delete body['cost'];
    const sizes = this.sizes().filter((s) => s.size.trim());
    if (sizes.length) body['sizes'] = sizes.map((s) => ({ size: s.size.trim(), qty: +(s.qty ?? 0) }));

    const colorRows = this.colors().filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex && c.hex !== '#cccccc' ? c.hex : undefined }));
    if (colorRows.length) body['colors'] = colorRows;
    else if (body['color']) body['colors'] = [{ name: String(body['color']).trim() }];

    const accRows = this.accessories().filter((a) => a.name.trim()).map((a) => ({
      name: a.name.trim(),
      color: a.color.trim() || undefined,
      size: a.size.trim() || undefined,
      code: a.code.trim() || undefined,
      qty: a.qty != null ? +a.qty : undefined,
    }));
    if (accRows.length) body['accessories'] = accRows;

    const id = this.editing()?.id;
    const pending = this.pendingPreviews().filter((p) => !p.uploading).map((p) => p.file);
    const removed = this.removedPhotoIds();
    const req = id ? this.api.patch<ProductModel>(`/models/${id}`, body) : this.api.post<ProductModel>('/models', body);
    req.pipe(
      switchMap((model) => {
        const modelId = id || model.id;
        const uploads = pending.map((f) =>
          this.api.upload<ModelPhoto>(`/models/${modelId}/photos`, f).pipe(catchError(() => of(null))),
        );
        return uploads.length ? forkJoin(uploads).pipe(map(() => model)) : of(model);
      }),
    ).subscribe({
      next: (model) => {
        this.busy.set(false);
        this.revokePendingPreviews();
        this.editing.set(null);
        this.toast.success(this.i18n.t('saved'));
        if (!id && model) {
          this.data.update((d) => d ? { ...d, items: [model, ...d.items.filter((x) => x.id !== model.id)], total: d.total + 1 } : d);
        }
        this.reload(!id);
      },
      error: (err) => {
        this.busy.set(false);
        const m = err?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  archive(m: ProductModel): void {
    this.api.delete(`/models/${m.id}`).subscribe({
      next: () => { this.archiving.set(null); this.toast.success(this.i18n.t('archived')); this.reload(false); },
      error: () => this.archiving.set(null),
    });
  }
}
