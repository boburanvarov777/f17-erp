import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap, catchError, map } from 'rxjs';
import type { Accessory, Client, ModelColor, ModelFile, ModelPhoto, ModelSize, Paginated, ProductModel } from '../../core/models';
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
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.scss',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, GroupedNumberDirective, SizeRowFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  readonly existingFiles = signal<ModelFile[]>([]);
  readonly pendingPreviews = signal<{ key: string; url: string; file: File; uploading?: boolean }[]>([]);
  readonly removedPhotoIds = signal<string[]>([]);
  readonly photoUploading = signal(false);
  readonly fileUploading = signal(false);
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
    this.fileUploading.set(false);
    this.existingFiles.set([]);
    this.sizes.set([]);
    this.colors.set([]);
    this.accessories.set([]);
    this.editing.set(m);
    if (m.id) {
      this.api.get<ProductModel>(`/models/${m.id}`).subscribe({
        next: (full) => {
          this.existingPhotos.set(full.photos ?? []);
          this.existingFiles.set(full.files ?? []);
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
      this.existingFiles.set([]);
    }
  }

  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const modelId = this.editing()?.id;
    if (!modelId || !files.length) return;
    this.fileUploading.set(true);
    forkJoin(files.map((f) => this.api.upload<ModelFile>(`/models/${modelId}/files`, f).pipe(catchError(() => of(null))))).subscribe({
      next: (uploaded) => {
        this.existingFiles.update((list) => [...list, ...uploaded.filter(Boolean) as ModelFile[]]);
        this.fileUploading.set(false);
      },
      error: () => { this.fileUploading.set(false); this.toast.error(this.i18n.t('error')); },
    });
  }

  removeFile(id: string): void {
    this.existingFiles.update((f) => f.filter((x) => x.id !== id));
    this.api.delete(`/models/files/${id}`).subscribe({ error: () => this.toast.error(this.i18n.t('error')) });
  }

  formatSize(bytes?: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
