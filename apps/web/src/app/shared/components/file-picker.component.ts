import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from '../ui/icon.component';
import {
  formatFileSize,
  modelFileIcon,
  modelFileKind,
  resolveStorageUrl,
  type ModelFileKind,
} from '../constants/model-files';

export interface FilePickerItem {
  id?: string;
  key?: string;
  name: string;
  url?: string;
  mime?: string;
  size?: number;
  /** 1–100 while uploading */
  progress?: number;
  /** Brief success flash before card settles */
  uploadDone?: boolean;
  /** Brief error flash before card is removed */
  uploadFailed?: boolean;
}

@Component({
  selector: 'app-file-picker',
  templateUrl: './file-picker.component.html',
  styleUrl: './file-picker.component.scss',
  standalone: true,
  imports: [TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilePickerComponent {
  readonly items = input<FilePickerItem[]>([]);
  readonly uploading = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);

  readonly filesPicked = output<File[]>();
  readonly removeItem = output<{ id?: string; key?: string }>();

  readonly formatSize = formatFileSize;
  readonly resolveUrl = resolveStorageUrl;

  itemKey(item: FilePickerItem): string {
    return item.id ?? item.key ?? item.name;
  }

  kind(item: FilePickerItem): ModelFileKind {
    return modelFileKind(item.mime, item.name);
  }

  icon(item: FilePickerItem): string {
    return modelFileIcon(this.kind(item));
  }

  showProgress(item: FilePickerItem): boolean {
    return item.progress != null && !item.uploadDone && !item.uploadFailed;
  }

  isUploading(item: FilePickerItem): boolean {
    return this.showProgress(item) && (item.progress ?? 0) < 100;
  }

  canDownload(item: FilePickerItem): boolean {
    return !!item.url && !this.showProgress(item) && !item.uploadDone && !item.uploadFailed;
  }

  onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.filesPicked.emit(files);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    if (this.disabled() || this.uploading()) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) this.filesPicked.emit(files);
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
  }
}
