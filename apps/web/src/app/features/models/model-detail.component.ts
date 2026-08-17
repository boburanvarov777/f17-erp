import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProductModel } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [RouterLink, IconComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, TPipe, NumPipe, ShortDatePipe],
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
          <div class="card">
            <div class="photo">
              @if (m.photo) { <img [src]="m.photo" [alt]="m.name" /> } @else { <ui-icon name="shirt" [size]="52" [stroke]="1.1" /> }
            </div>
            <div class="card-body">
              <dl class="kv">
                <dt>{{ 'category' | t }}</dt><dd>{{ m.category || '—' }}</dd>
                <dt>{{ 'season' | t }}</dt><dd>{{ m.season || '—' }}</dd>
                <dt>{{ 'color' | t }}</dt><dd>{{ m.color || '—' }}</dd>
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
                } @else { <ui-empty icon="info" [title]="'no_data' | t" /> }
              </div>
            </div>

            <div class="card">
              <div class="card-head"><h3>{{ 'colors' | t }}</h3></div>
              <div class="card-body">
                @if (m.colors?.length) {
                  <div class="row gap-3 wrap">
                    @for (c of m.colors; track c.name) {
                      <div class="row gap-2">
                        <i class="swatch" [style.background]="c.hex || '#ccc'"></i>
                        <span class="small">{{ c.name }}</span>
                      </div>
                    }
                  </div>
                } @else { <span class="small text-3">—</span> }
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
                    } @empty { <tr><td colspan="5"><ui-empty icon="package" [title]="'no_data' | t" /></td></tr> }
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
                    } @empty { <tr><td colspan="5"><ui-empty icon="clipboard-list" [title]="'no_orders' | t" /></td></tr> }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .grid.layout { grid-template-columns: 330px minmax(0, 1fr); align-items: start; }
    @media (max-width: 960px) { .grid.layout { grid-template-columns: 1fr; } }
    .photo { height: 300px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; color: var(--text-3); border-radius: var(--r-lg) var(--r-lg) 0 0; overflow: hidden; }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    dl.kv { display: grid; grid-template-columns: minmax(90px, auto) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
    dl.kv dt { color: var(--text-3); } dl.kv dd { margin: 0; }
    .size-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
    .chip { border: 1px solid var(--border); border-radius: var(--r); padding: 9px; text-align: center; background: var(--surface-2); }
    .chip-k { display: block; font-size: 11px; color: var(--text-3); text-transform: uppercase; }
    .chip-v { display: block; font-size: 16px; font-weight: 600; }
    .swatch { width: 20px; height: 20px; border-radius: 5px; border: 1px solid var(--border); display: inline-block; }
  `],
})
export class ModelDetailComponent {
  private api = inject(ApiService);
  readonly id = input.required<string>();
  readonly model = signal<ProductModel | null>(null);
  readonly loading = signal(false);
  readonly sizeTotal = computed(() => (this.model()?.sizes ?? []).reduce((a, s) => a + s.qty, 0));

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
