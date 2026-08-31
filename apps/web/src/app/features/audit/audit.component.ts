import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AuditLog, Paginated } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { InitialsPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';

@Component({
  selector: 'app-audit',
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, DateInputComponent, TPipe, ShortDatePipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  search = ''; action = ''; from = ''; to = '';
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly data = signal<Paginated<AuditLog> | null>(null);
  readonly actions = signal<string[]>([]);
  readonly loading = signal(false);
  readonly detail = signal<AuditLog | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.api.get<string[]>('/audit/actions').subscribe({ next: (a) => this.actions.set(a), error: () => void 0 });
  }

  onSearch(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.reload(), 320); }

  reload(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.api.get<Paginated<AuditLog>>('/audit', {
      page: this.page(), limit: this.limit(), search: this.search, action: this.action, from: this.from, to: this.to,
    }).subscribe({
      next: (d) => { this.data.set(d); this.page.set(d.page); this.limit.set(d.limit); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  pretty(v: unknown): string { return v ? JSON.stringify(v, null, 2) : '—'; }

  tone(a: string): string {
    if (a.includes('DELETE') || a.includes('CANCEL') || a.includes('BLOCK')) return 'badge-danger';
    if (a.includes('CREATE')) return 'badge-success';
    if (a.includes('UPDATE') || a.includes('CHANGE')) return 'badge-warning';
    if (a.includes('LOGIN') || a.includes('TELEGRAM')) return 'badge-info';
    return 'badge-neutral';
  }
}
