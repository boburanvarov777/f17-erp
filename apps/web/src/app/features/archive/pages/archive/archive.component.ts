import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { isTopAdmin } from '../../../../core/utils/role.util';
import { ConfirmComponent } from '../../../../shared/ui/confirm.component';
import { I18nService } from '../../../../core/services/i18n.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ShortDatePipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModalComponent } from '../../../../shared/ui/modal.component';
import { OrderDetailComponent } from '../../../orders/pages/order-detail/order-detail.component';

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
  templateUrl: './archive.component.html',
  styleUrl: './archive.component.scss',
  standalone: true,
  imports: [IconComponent, LoadingComponent, EmptyComponent, ModalComponent, ConfirmComponent, OrderDetailComponent, TPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  /** Restoring stays with Super Admin / Super Pro Admin; others only delete. */
  readonly canRestore = computed(() => isTopAdmin(this.auth.user()));

  readonly modules = signal<ArchiveModuleTab[]>([]);
  readonly module = signal<ArchiveModuleKey>('users');
  readonly data = signal<ArchivePayload | null>(null);
  readonly loading = signal(true);
  readonly viewOrder = signal<ArchiveOrder | null>(null);
  /** Pending permanent delete — orders/models/warehouse.purge, set per role. */
  readonly deleting = signal<{ type: 'order' | 'model' | 'material'; id: string; name: string } | null>(null);

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
    this.viewOrder.set(null);
    this.load(key);
  }

  openViewOrder(o: ArchiveOrder): void {
    this.viewOrder.set(o);
  }

  orderSubtitle(o: ArchiveOrder): string {
    const parts = [o.model?.code, o.client?.name].filter(Boolean);
    return parts.join(' · ') || '—';
  }

  load(key?: ArchiveModuleKey): void {
    this.loading.set(true);
    this.viewOrder.set(null);
    this.api.get<ArchivePayload>('/archive', { module: key ?? this.module() }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  hasItems(d: ArchivePayload): boolean {
    return d.users.length + d.orders.length + d.models.length + d.materials.length > 0;
  }

  confirmKey(type: 'order' | 'model' | 'material', part: 'confirm' | 'note'): string {
    return `${type}_delete_${part}`;
  }

  hardDelete(): void {
    const d = this.deleting();
    if (!d) return;
    this.api.delete(`/archive/${d.type}/${d.id}`).subscribe({
      next: () => {
        this.deleting.set(null);
        this.toast.success(this.i18n.t('deleted'), d.name);
        this.api.get<ArchiveModuleTab[]>('/archive/modules').subscribe({
          next: (mods) => { this.modules.set(mods); this.load(); },
        });
      },
      error: () => this.deleting.set(null),
    });
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
