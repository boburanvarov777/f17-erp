import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap, catchError, map, Observable } from 'rxjs';
import type { Accessory, Client, ModelColor, ModelFile, ModelPhoto, ModelSize, Paginated, ProductModel } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { seesFinancials } from '../../../../core/utils/role.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { PaginationComponent } from '../../../../shared/ui/pagination.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { applyApiValidationErrors, FieldErrorsState, focusFirstInvalidField, runValidation } from '../../../../shared/utils/form-validate';
import { GroupedNumberDirective } from '../../../../shared/directives/grouped-number.directive';
import { SizeRowFieldsComponent } from '../../../../shared/components/size-row-fields.component';
import { FilePickerComponent, type FilePickerItem } from '../../../../shared/components/file-picker.component';
import { isModelFileAllowed, MODEL_FILE_MAX_BYTES } from '../../../../shared/constants/model-files';

interface PendingFile {
  key: string;
  file: File;
  progress?: number;
  uploadDone?: boolean;
  uploadFailed?: boolean;
  result?: ModelFile;
}

@Component({
  selector: 'app-models-list',
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.scss',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, StatusBadgeComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, ConfirmComponent, TPipe, GroupedNumberDirective, SizeRowFieldsComponent, FilePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly showFinancials = computed(() => seesFinancials(this.auth.user()));

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
  readonly pendingFiles = signal<PendingFile[]>([]);
  readonly pendingPreviews = signal<{ key: string; url: string; file: File; uploading?: boolean }[]>([]);
  readonly removedPhotoIds = signal<string[]>([]);
  readonly photoUploading = signal(false);
  readonly fileUploading = signal(false);
  readonly filesLoading = signal(false);
  readonly photoCount = computed(() => this.existingPhotos().length + this.pendingPreviews().length);
  readonly filePickerItems = computed<FilePickerItem[]>(() => [
    ...this.existingFiles().map((f) => ({
      id: f.id,
      name: f.name || 'File',
      url: f.url,
      mime: f.mime,
      size: f.size,
    })),
    ...this.pendingFiles().map((p) => ({
      key: p.key,
      name: p.file.name || p.result?.name || 'File',
      mime: p.file.type || p.result?.mime,
      size: p.file.size || p.result?.size,
      progress: p.progress,
      uploadDone: p.uploadDone,
      uploadFailed: p.uploadFailed,
    })),
  ]);
  readonly fe = new FieldErrorsState();

  form: Record<string, any> = {};
  private timer?: ReturnType<typeof setTimeout>;
  private progressTimers = new Map<string, ReturnType<typeof setInterval>>();
  private uploadStartedAt = new Map<string, number>();
  private successTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly MIN_UPLOAD_MS = 1600;
  private static readonly SUCCESS_MS = 2000;

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
    this.clearAllProgressTimers();
    this.pendingFiles.set([]);
    this.removedPhotoIds.set([]);
    this.photoUploading.set(false);
    this.fileUploading.set(false);
    this.filesLoading.set(false);
    this.existingFiles.set([]);
    this.sizes.set([]);
    this.colors.set([]);
    this.accessories.set([]);
    this.editing.set(m);
    if (m.id) {
      this.filesLoading.set(true);
      this.api.get<ProductModel>(`/models/${m.id}`).subscribe({
        next: (full) => {
          this.existingPhotos.set(full.photos ?? []);
          this.existingFiles.set(full.files ?? []);
          this.sizes.set((full.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
          this.colors.set((full.colors ?? []).map((c) => ({ name: c.name, hex: c.hex || '#cccccc' })));
          this.accessories.set((full.accessories ?? []).map((a) => ({
            name: a.name, color: a.color ?? '', size: a.size ?? '', code: a.code ?? '', qty: a.qty ?? null,
          })));
          this.filesLoading.set(false);
        },
        error: () => {
          this.existingPhotos.set([]);
          this.existingFiles.set([]);
          this.sizes.set((m.sizes ?? []).map((s) => ({ size: s.size, qty: s.qty })));
          this.filesLoading.set(false);
        },
      });
    } else {
      this.existingPhotos.set([]);
      this.existingFiles.set([]);
    }
  }

  onFilesPicked(files: File[]): void {
    const valid: File[] = [];
    for (const file of files) {
      if (!isModelFileAllowed(file) || file.size > MODEL_FILE_MAX_BYTES) {
        this.toast.error(this.i18n.t('file_hint'));
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;

    const modelId = this.editing()?.id;
    if (modelId) {
      this.uploadFilesNow(modelId, valid);
      return;
    }

    this.pendingFiles.update((list) => [
      ...list,
      ...valid.map((f) => ({ key: crypto.randomUUID(), file: f })),
    ]);
  }

  private uploadFilesNow(modelId: string, files: File[]): void {
    this.fileUploading.set(true);
    for (const file of files) {
      const key = crypto.randomUUID();
      this.uploadStartedAt.set(key, Date.now());
      this.pendingFiles.update((list) => [...list, { key, file, progress: 1 }]);
      this.animateFileProgress(key);
      queueMicrotask(() => {
        this.api.uploadWithProgress<ModelFile>(`/models/${modelId}/files`, file).subscribe({
          next: ({ progress, result }) => {
            if (progress < 100) this.mergeFileProgress(key, progress);
            if (result) this.scheduleUploadComplete(key, result);
          },
          error: () => this.onFileUploadFailed(key),
        });
      });
    }
  }

  private scheduleUploadComplete(key: string, file: ModelFile): void {
    this.pendingFiles.update((list) =>
      list.map((p) => (p.key === key ? { ...p, result: file } : p)),
    );
    this.pollUploadComplete(key);
  }

  private pollUploadComplete(key: string): void {
    const started = this.uploadStartedAt.get(key) ?? Date.now();
    const elapsed = Date.now() - started;
    const pending = this.pendingFiles().find((p) => p.key === key);
    if (!pending?.result || pending.uploadDone || pending.uploadFailed) return;

    const progressOk = (pending.progress ?? 0) >= 88;
    const timeOk = elapsed >= ModelsListComponent.MIN_UPLOAD_MS;

    if (progressOk && timeOk) {
      this.showUploadSuccess(key, pending.result);
      return;
    }
    setTimeout(() => this.pollUploadComplete(key), 60);
  }

  private showUploadSuccess(key: string, file: ModelFile): void {
    if (this.successTimers.has(key)) return;
    this.clearProgressTimer(key);
    this.pendingFiles.update((list) =>
      list.map((p) => (p.key === key ? { ...p, progress: 100, uploadDone: true, result: file } : p)),
    );
    const timer = setTimeout(() => {
      this.successTimers.delete(key);
      this.uploadStartedAt.delete(key);
      this.pendingFiles.update((list) => list.filter((p) => p.key !== key));
      this.existingFiles.update((list) => [...list, file]);
      this.syncFileUploadingFlag();
    }, ModelsListComponent.SUCCESS_MS);
    this.successTimers.set(key, timer);
  }

  private animateFileProgress(key: string): void {
    this.clearProgressTimer(key);
    let simulated = 1;
    const id = setInterval(() => {
      const pending = this.pendingFiles().find((p) => p.key === key);
      if (!pending || pending.uploadDone || pending.uploadFailed) {
        this.clearProgressTimer(key);
        return;
      }
      // Slow down near the end until HTTP response arrives
      const cap = pending.result ? 96 : 88;
      simulated = Math.min(cap, simulated + (simulated < 30 ? 4 : simulated < 60 ? 3 : 2));
      this.pendingFiles.update((list) =>
        list.map((p) => {
          if (p.key !== key || p.uploadDone || p.uploadFailed) return p;
          return { ...p, progress: Math.max(p.progress ?? 1, simulated) };
        }),
      );
      if (pending.result) this.pollUploadComplete(key);
    }, 70);
    this.progressTimers.set(key, id);
  }

  private mergeFileProgress(key: string, real: number): void {
    this.pendingFiles.update((list) =>
      list.map((p) =>
        p.key === key && !p.uploadDone && !p.uploadFailed
          ? { ...p, progress: Math.max(p.progress ?? 1, Math.min(96, real)) }
          : p,
      ),
    );
  }

  private onFileUploadFailed(key: string): void {
    this.pendingFiles.update((list) =>
      list.map((p) => (p.key === key ? { ...p, progress: p.progress ?? 1, uploadFailed: true } : p)),
    );
    setTimeout(() => {
      this.clearProgressTimer(key);
      this.pendingFiles.update((list) => list.filter((p) => p.key !== key));
      this.syncFileUploadingFlag();
    }, 1600);
  }

  private clearProgressTimer(key: string): void {
    const id = this.progressTimers.get(key);
    if (id != null) {
      clearInterval(id);
      this.progressTimers.delete(key);
    }
  }

  private clearSuccessTimer(key: string): void {
    const id = this.successTimers.get(key);
    if (id != null) {
      clearTimeout(id);
      this.successTimers.delete(key);
    }
  }

  private clearAllProgressTimers(): void {
    for (const key of [...this.progressTimers.keys()]) this.clearProgressTimer(key);
    for (const key of [...this.successTimers.keys()]) this.clearSuccessTimer(key);
    this.uploadStartedAt.clear();
  }

  private syncFileUploadingFlag(): void {
    const busy = this.pendingFiles().some((p) => !p.uploadDone && !p.uploadFailed);
    this.fileUploading.set(busy);
  }

  onFileRemove(target: { id?: string; key?: string }): void {
    if (target.id) {
      this.existingFiles.update((f) => f.filter((x) => x.id !== target.id));
      this.api.delete(`/models/files/${target.id}`).subscribe({ error: () => this.toast.error(this.i18n.t('error')) });
      return;
    }
    if (target.key) {
      this.clearProgressTimer(target.key);
      this.clearSuccessTimer(target.key);
      this.uploadStartedAt.delete(target.key);
      this.pendingFiles.update((f) => f.filter((x) => x.key !== target.key));
    }
  }

  private uploadPendingFiles(modelId: string) {
    const pending = this.pendingFiles().filter((p) => p.progress == null);
    if (!pending.length) return of(null);
    this.fileUploading.set(true);
    for (const p of pending) this.uploadStartedAt.set(p.key, Date.now());
    this.pendingFiles.update((list) =>
      list.map((x) => (pending.some((p) => p.key === x.key) ? { ...x, progress: 1 } : x)),
    );
    for (const p of pending) this.animateFileProgress(p.key);
    return forkJoin(
      pending.map((p) =>
        this.api.uploadWithProgress<ModelFile>(`/models/${modelId}/files`, p.file).pipe(
          map(({ progress, result }) => {
            if (progress < 100) this.mergeFileProgress(p.key, progress);
            if (result) this.scheduleUploadComplete(p.key, result);
            return result;
          }),
          catchError(() => of(null)),
        ),
      ),
    ).pipe(
      switchMap((results) => {
        const ok = results.filter(Boolean) as ModelFile[];
        if (!ok.length) {
          this.syncFileUploadingFlag();
          return of(null);
        }
        return new Observable((sub) => {
          const wait = () => {
            const busy = this.pendingFiles().some((x) => pending.some((p) => p.key === x.key));
            if (!busy) {
              this.syncFileUploadingFlag();
              sub.next(null);
              sub.complete();
              return;
            }
            setTimeout(wait, 120);
          };
          setTimeout(wait, ModelsListComponent.MIN_UPLOAD_MS + ModelsListComponent.SUCCESS_MS);
        });
      }),
    );
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
    const clientErrors = runValidation([
      { key: 'code', label: t('model_code'), value: this.form['code'], required: true, minLength: 2 },
      { key: 'name', label: t('model_name'), value: this.form['name'], required: true, minLength: 2 },
    ], t);
    if (!this.fe.apply(clientErrors)) {
      focusFirstInvalidField(Object.keys(clientErrors!));
      return;
    }

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
    const req = id
      ? this.api.patch<ProductModel>(`/models/${id}`, body, { silent: true })
      : this.api.post<ProductModel>('/models', body, { silent: true });
    req.pipe(
      switchMap((model) => {
        const modelId = id || model.id;
        const photoUploads = pending.map((f) =>
          this.api.upload<ModelPhoto>(`/models/${modelId}/photos`, f).pipe(catchError(() => of(null))),
        );
        const photo$ = photoUploads.length ? forkJoin(photoUploads) : of(null);
        const file$ = this.uploadPendingFiles(modelId);
        return forkJoin([photo$, file$]).pipe(map(() => model));
      }),
    ).subscribe({
      next: (model) => {
        this.busy.set(false);
        this.revokePendingPreviews();
        this.clearAllProgressTimers();
        this.pendingFiles.set([]);
        this.editing.set(null);
        this.toast.success(this.i18n.t('saved'));
        if (!id && model) {
          this.data.update((d) => d ? { ...d, items: [model, ...d.items.filter((x) => x.id !== model.id)], total: d.total + 1 } : d);
        }
        this.reload(!id);
      },
      error: (err) => {
        this.busy.set(false);
        const apiErrors = applyApiValidationErrors(err);
        if (apiErrors) {
          this.fe.apply(apiErrors);
          focusFirstInvalidField(Object.keys(apiErrors));
          return;
        }
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
