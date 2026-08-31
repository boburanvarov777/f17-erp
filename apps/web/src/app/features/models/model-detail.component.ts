import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ModelColor, ProductModel } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-model-detail',
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.scss',
  standalone: true,
  imports: [RouterLink, IconComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent {
  private api = inject(ApiService);
  readonly id = input.required<string>();
  readonly model = signal<ProductModel | null>(null);
  readonly loading = signal(false);
  readonly lightboxUrl = signal<string | null>(null);
  readonly sizeTotal = computed(() => (this.model()?.sizes ?? []).reduce((a, s) => a + s.qty, 0));
  readonly photoUrls = computed(() => {
    const m = this.model();
    if (!m) return [] as string[];
    if (m.photos?.length) return m.photos.map((p) => p.url);
    if (m.photo) return [m.photo];
    return [];
  });
  readonly displayColors = computed((): ModelColor[] => {
    const m = this.model();
    if (!m) return [];
    const out: ModelColor[] = [];
    const seen = new Set<string>();
    const add = (c: ModelColor) => {
      const key = c.name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ name: c.name.trim(), hex: c.hex });
    };
    if (m.color?.trim()) {
      const match = m.colors?.find((c) => c.name.trim().toLowerCase() === m.color!.trim().toLowerCase());
      add({ name: m.color.trim(), hex: match?.hex });
    }
    for (const c of m.colors ?? []) add(c);
    return out;
  });

  openPhoto(url: string): void { this.lightboxUrl.set(url); }

  constructor() {
    effect(() => {
      const id = this.id();
      if (!id) return;
      this.loading.set(true);
      this.api.get<ProductModel>(`/models/${id}`).subscribe({
        next: (m) => { this.model.set(m); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    });
  }
}
