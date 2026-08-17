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
  standalone: true,
  imports: [RouterLink, IconComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (loading() && !model()) { <ui-loading [count]="4" [height]="80" /> }
      @else if (model(); as m) {
        <div class="breadcrumb no-print">
          <a routerLink="/models">{{ 'models_title' | t }}</a><ui-icon name="chevron-right" [size]="13" /><span>{{ m.code }}</span>
        </div>

        <div class="page-head">
          <div>
            <div class="row gap-3">
              <span class="title mono">{{ m.code }}</span>
              <ui-status [value]="m.status" />
            </div>
            <div class="sub">{{ m.name }} · {{ m.client?.name || '—' }}</div>
          </div>
        </div>

        <div class="grid layout">
          <div class="card sidebar-card">
            <div class="photos-block">
              @if (photoUrls().length) {
                <div class="photos-grid" [class.single]="photoUrls().length === 1">
                  @for (url of photoUrls(); track url) {
                    <button type="button" class="photo-tile" (click)="openPhoto(url)" [attr.aria-label]="'photo_view' | t">
                      <img [src]="url" [alt]="m.name" />
                      <span class="photo-hover"><ui-icon name="eye" [size]="22" /></span>
                    </button>
                  }
                </div>
              } @else {
                <div class="photo-empty"><ui-icon name="shirt" [size]="52" [stroke]="1.1" /></div>
              }
            </div>

            <div class="card-body">
              <dl class="kv">
                <dt>{{ 'category' | t }}</dt><dd>{{ m.category || '—' }}</dd>
                <dt>{{ 'season' | t }}</dt><dd>{{ m.season || '—' }}</dd>
                <dt>{{ 'fabric' | t }}</dt><dd>{{ m.fabric || '—' }}</dd>
                <dt>{{ 'lining' | t }}</dt><dd>{{ m.lining || '—' }}</dd>
                <dt>{{ 'cost' | t }}</dt><dd>{{ m.cost ? (m.cost | num) + ' ' + ('currency_uzs' | t) : '—' }}</dd>
              </dl>
              @if (m.description) { <div class="divider"></div><div class="small text-2">{{ m.description }}</div> }
            </div>
          </div>

          <div class="col gap-4">
            <div class="card">
              <div class="card-head"><h3>{{ 'sizes' | t }}</h3><span class="badge badge-neutral">{{ sizeTotal() | num }} {{ 'pieces' | t }}</span></div>
              <div class="card-body">
                @if (m.sizes?.length) {
                  <div class="size-chips">
                    @for (s of m.sizes; track s.size) {
                      <div class="chip"><span class="chip-k">{{ s.size }}</span><span class="chip-v">{{ s.qty | num }}</span></div>
                    }
                  </div>
                } @else {
                  <ui-empty icon="info" [title]="'no_data' | t" />
                  <p class="empty-hint">{{ 'model_sizes_hint' | t }}</p>
                }
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h3>{{ 'colors' | t }}</h3></div>
              <div class="card-body">
                @if (displayColors().length) {
                  <div class="row gap-3 wrap">
                    @for (c of displayColors(); track c.name) {
                      <div class="row gap-2">
                        <i class="swatch" [style.background]="c.hex || '#ccc'"></i>
                        <span class="small">{{ c.name }}</span>
                      </div>
                    }
                  </div>
                } @else {
                  <ui-empty icon="palette" [title]="'no_data' | t" />
                  <p class="empty-hint">{{ 'model_colors_hint' | t }}</p>
                }
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h3>{{ 'accessories' | t }}</h3></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'material' | t }}</th><th>{{ 'color' | t }}</th><th>{{ 'size_label' | t }}</th><th>{{ 'code' | t }}</th><th class="num">{{ 'quantity' | t }}</th></tr></thead>
                  <tbody>
                    @for (a of m.accessories; track a.name + (a.code || '')) {
                      <tr>
                        <td>{{ a.name }}</td><td class="small">{{ a.color || '—' }}</td>
                        <td class="small">{{ a.size || '—' }}</td><td class="mono small">{{ a.code || '—' }}</td>
                        <td class="num">{{ a.qty || '—' }}</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5">
                        <ui-empty icon="package" [title]="'no_data' | t" />
                        <p class="empty-hint">{{ 'model_accessories_hint' | t }}</p>
                      </td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h3>{{ 'orders_title' | t }}</h3></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'order_no' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th>{{ 'order_date' | t }}</th><th>{{ 'deadline' | t }}</th><th>{{ 'status' | t }}</th></tr></thead>
                  <tbody>
                    @for (o of m.orders; track o.id) {
                      <tr class="clickable" [routerLink]="['/orders', o.id]">
                        <td><b class="mono">{{ o.number }}</b></td>
                        <td class="num">{{ o.qty | num }}</td>
                        <td class="small">{{ o.orderDate | shortDate }}</td>
                        <td class="small">{{ o.deadline | shortDate }}</td>
                        <td><ui-status [value]="o.status" /></td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5">
                        <ui-empty icon="clipboard-list" [title]="'no_orders' | t" />
                        <p class="empty-hint">{{ 'model_orders_hint' | t }}</p>
                      </td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        @if (lightboxUrl(); as url) {
          <ui-modal [title]="model()?.name || ('photo' | t)" size="xl" (closed)="lightboxUrl.set(null)">
            <img class="lightbox-img" [src]="url" [alt]="model()?.name || 'model'" />
          </ui-modal>
        }
      }
    </div>
  `,
  styles: [`
    .grid.layout { grid-template-columns: 330px minmax(0, 1fr); align-items: start; }
    @media (max-width: 960px) { .grid.layout { grid-template-columns: 1fr; } }
    .sidebar-card { overflow: hidden; }
    .photos-block { padding: 12px 12px 0; background: var(--surface-2); border-bottom: 1px solid var(--border); }
    .photos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .photos-grid.single { grid-template-columns: 1fr; }
    .photo-tile {
      position: relative; border: none; padding: 0; border-radius: var(--r); overflow: hidden;
      aspect-ratio: 1; background: var(--surface-3); cursor: zoom-in;
    }
    .photo-tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s ease; }
    .photo-hover {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.45); color: #fff; opacity: 0; transition: opacity .15s ease;
    }
    .photo-tile:hover img { transform: scale(1.04); }
    .photo-tile:hover .photo-hover { opacity: 1; }
    .photo-empty {
      height: 220px; display: flex; align-items: center; justify-content: center;
      color: var(--text-3); background: var(--surface-3); border-radius: var(--r); margin-bottom: 12px;
    }
    .empty-hint { margin: 8px 0 0; text-align: center; font-size: 12px; color: var(--text-3); line-height: 1.45; }
    .lightbox-img { display: block; width: 100%; max-height: min(78vh, 900px); object-fit: contain; margin: 0 auto; border-radius: var(--r); }
    dl.kv { display: grid; grid-template-columns: minmax(90px, auto) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
    dl.kv dt { color: var(--text-3); } dl.kv dd { margin: 0; }
    .size-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
    .chip { border: 1px solid var(--border); border-radius: var(--r); padding: 9px; text-align: center; background: var(--surface-2); }
    .chip-k { display: block; font-size: 11px; color: var(--text-3); text-transform: uppercase; }
    .chip-v { display: block; font-size: 16px; font-weight: 600; }
    .swatch { width: 20px; height: 20px; border-radius: 5px; border: 1px solid var(--border); display: inline-block; flex-shrink: 0; }
  `],
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
