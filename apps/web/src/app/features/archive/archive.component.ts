import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';

type ArchiveModuleKey = 'users' | 'orders' | 'models' | 'materials';
type RestoreType = 'user' | 'order' | 'model' | 'material';

interface ArchiveModuleTab {
  key: ArchiveModuleKey;
  labelKey: string;
  count: number;
}

interface ArchiveUser {
  id: string;
  firstName: string;
  lastName: string;
  login: string;
  phone: string;
  position?: string;
  archivedAt?: string;
  role?: { name: string };
}

interface ArchiveOrder {
  id: string;
  number: string;
  qty: number;
  status: string;
  archivedAt?: string;
  client?: { name: string };
  model?: { code: string; name: string };
}

interface ArchiveModel {
  id: string;
  code: string;
  name: string;
  category?: string;
  archivedAt?: string;
  client?: { name: string };
}

interface ArchiveMaterial {
  id: string;
  code: string;
  name: string;
  category?: string;
  unit: string;
  stock: number;
  archivedAt?: string;
}

interface ArchivePayload {
  module: ArchiveModuleKey;
  users: ArchiveUser[];
  orders: ArchiveOrder[];
  models: ArchiveModel[];
  materials: ArchiveMaterial[];
  counts: Record<string, number>;
}

const MODULE_ICONS: Record<ArchiveModuleKey, string> = {
  users: 'users',
  orders: 'clipboard-list',
  models: 'shirt',
  materials: 'boxes',
};

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [IconComponent, LoadingComponent, EmptyComponent, TPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'archive_title' | t }}</div>
          <div class="sub">{{ 'archive_subtitle_modules' | t }}</div>
        </div>
      </div>

      <div class="mod-tabs mb-4">
        @for (m of modules(); track m.key) {
          <button type="button" class="mod-tab" [class.on]="module() === m.key" (click)="selectModule(m.key)">
            <ui-icon [name]="icon(m.key)" [size]="16" />
            {{ m.labelKey | t }}
            @if (m.count > 0) { <span class="cnt">{{ m.count }}</span> }
          </button>
        }
      </div>

      @if (loading()) {
        <ui-loading [count]="4" [height]="72" />
      } @else if (data(); as d) {
        @if (!hasItems(d)) {
          <ui-empty icon="archive" [title]="'archive_empty' | t" [message]="'archive_empty_msg' | t" />
        } @else {
          @if (d.users.length) {
            <section class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr>
                    <th>{{ 'full_name' | t }}</th><th>{{ 'login' | t }}</th>
                    <th>{{ 'role' | t }}</th><th>{{ 'archived_at' | t }}</th><th class="actions"></th>
                  </tr></thead>
                  <tbody>
                    @for (u of d.users; track u.id) {
                      <tr>
                        <td class="small bold">{{ u.lastName }} {{ u.firstName }}</td>
                        <td class="mono small">{{ u.login }}</td>
                        <td class="small">{{ u.role?.name || '—' }}</td>
                        <td class="small nowrap">{{ u.archivedAt | shortDate: true }}</td>
                        <td class="actions">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="restore('user', u.id)">
                            <ui-icon name="rotate-ccw" [size]="14" /> {{ 'restore' | t }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          @if (d.orders.length) {
            <section class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr>
                    <th>{{ 'order' | t }}</th><th>{{ 'model' | t }}</th><th>{{ 'client' | t }}</th>
                    <th>{{ 'archived_at' | t }}</th><th class="actions"></th>
                  </tr></thead>
                  <tbody>
                    @for (o of d.orders; track o.id) {
                      <tr>
                        <td class="mono small bold">{{ o.number }}</td>
                        <td class="small">{{ o.model?.code || '—' }}</td>
                        <td class="small">{{ o.client?.name || '—' }}</td>
                        <td class="small nowrap">{{ o.archivedAt | shortDate: true }}</td>
                        <td class="actions">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="restore('order', o.id)">
                            <ui-icon name="rotate-ccw" [size]="14" /> {{ 'restore' | t }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          @if (d.models.length) {
            <section class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr>
                    <th>{{ 'code' | t }}</th><th>{{ 'model' | t }}</th><th>{{ 'client' | t }}</th>
                    <th>{{ 'archived_at' | t }}</th><th class="actions"></th>
                  </tr></thead>
                  <tbody>
                    @for (m of d.models; track m.id) {
                      <tr>
                        <td class="mono small bold">{{ m.code }}</td>
                        <td class="small">{{ m.name }}</td>
                        <td class="small">{{ m.client?.name || '—' }}</td>
                        <td class="small nowrap">{{ m.archivedAt | shortDate: true }}</td>
                        <td class="actions">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="restore('model', m.id)">
                            <ui-icon name="rotate-ccw" [size]="14" /> {{ 'restore' | t }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          @if (d.materials.length) {
            <section class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr>
                    <th>{{ 'code' | t }}</th><th>{{ 'material' | t }}</th><th>{{ 'current_stock' | t }}</th>
                    <th>{{ 'archived_at' | t }}</th><th class="actions"></th>
                  </tr></thead>
                  <tbody>
                    @for (m of d.materials; track m.id) {
                      <tr>
                        <td class="mono small bold">{{ m.code }}</td>
                        <td class="small">{{ m.name }}</td>
                        <td class="mono small">{{ m.stock }} {{ m.unit }}</td>
                        <td class="small nowrap">{{ m.archivedAt | shortDate: true }}</td>
                        <td class="actions">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="restore('material', m.id)">
                            <ui-icon name="rotate-ccw" [size]="14" /> {{ 'restore' | t }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        }
      }
    </div>
  `,
  styles: [`
    .mod-tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .mod-tab {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--r-lg);
      background: var(--surface);
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    }
    .mod-tab.on {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
      font-weight: 600;
    }
    .cnt {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: rgba(255,255,255,.22);
      font-size: 11px;
      line-height: 18px;
      text-align: center;
    }
    .mod-tab:not(.on) .cnt {
      background: var(--surface-3);
      color: var(--text-2);
    }
  `],
})
export class ArchiveComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  readonly modules = signal<ArchiveModuleTab[]>([]);
  readonly module = signal<ArchiveModuleKey>('users');
  readonly data = signal<ArchivePayload | null>(null);
  readonly loading = signal(true);

  constructor() {
    this.api.get<ArchiveModuleTab[]>('/archive/modules').subscribe({
      next: (mods) => {
        this.modules.set(mods);
        const first = mods.find((m) => m.count > 0) ?? mods[0];
        if (first) {
          this.module.set(first.key);
          this.load(first.key);
        } else {
          this.loading.set(false);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  icon(key: ArchiveModuleKey): string {
    return MODULE_ICONS[key];
  }

  selectModule(key: ArchiveModuleKey): void {
    if (this.module() === key) return;
    this.module.set(key);
    this.load(key);
  }

  load(key?: ArchiveModuleKey): void {
    this.loading.set(true);
    this.api.get<ArchivePayload>('/archive', { module: key ?? this.module() }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  hasItems(d: ArchivePayload): boolean {
    return d.users.length + d.orders.length + d.models.length + d.materials.length > 0;
  }

  restore(type: RestoreType, id: string): void {
    this.api.post('/archive/restore', { type, id }).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('restored'));
        this.api.get<ArchiveModuleTab[]>('/archive/modules').subscribe({
          next: (mods) => { this.modules.set(mods); this.load(); },
        });
      },
    });
  }
}
