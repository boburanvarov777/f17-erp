import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AuditLog, Paginated } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { InitialsPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [FormsModule, IconComponent, PaginationComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, ShortDatePipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'audit_title' | t }}</div>
          <div class="sub">{{ i18n.t('audit_count', { n: data()?.total || 0 }) }}</div>
        </div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search-box">
            <ui-icon name="search" [size]="15" />
            <input class="input" [(ngModel)]="search" (ngModelChange)="onSearch()" [placeholder]="'search' | t" />
          </div>
          <select class="select" style="width:auto;min-width:200px" [(ngModel)]="action" (ngModelChange)="reload()">
            <option value="">{{ 'what' | t }}: {{ 'all' | t }}</option>
            @for (a of actions(); track a) { <option [value]="a">{{ a }}</option> }
          </select>
          <input class="input" style="width:150px" type="date" [(ngModel)]="from" (ngModelChange)="reload()" />
          <input class="input" style="width:150px" type="date" [(ngModel)]="to" (ngModelChange)="reload()" />
        </div>

        @if (loading()) { <ui-loading /> }
        @else if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>{{ 'when' | t }}</th><th>{{ 'who' | t }}</th><th>{{ 'what' | t }}</th><th>{{ 'entity' | t }}</th><th>{{ 'ip' | t }}</th><th class="actions"></th></tr></thead>
                <tbody>
                  @for (l of d.items; track l.id) {
                    <tr>
                      <td class="small nowrap">{{ l.createdAt | shortDate: true }}</td>
                      <td>
                        @if (l.user) {
                          <div class="row gap-2">
                            <span class="avatar sm">{{ l.user.firstName | initials: l.user.lastName }}</span>
                            <span class="small">{{ l.user.lastName }} {{ l.user.firstName }}</span>
                          </div>
                        } @else { <span class="text-3 small">{{ 'system' | t }}</span> }
                      </td>
                      <td><span class="badge" [class]="tone(l.action)">{{ l.action }}</span></td>
                      <td class="small">{{ l.entity || '—' }}<span class="tiny text-3 mono"> {{ l.entityId ? l.entityId.slice(-6) : '' }}</span></td>
                      <td class="mono tiny text-3">{{ l.ip || '—' }}</td>
                      <td class="actions">
                        @if (l.oldValue || l.newValue) {
                          <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="detail.set(l)" [attr.data-tip]="'view' | t"><ui-icon name="eye" [size]="15" /></button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination [page]="d.page" [limit]="d.limit" [total]="d.total" [totalPages]="d.pages"
                           (pageChange)="page.set($event); reload(false)" (limitChange)="limit.set($event); reload()" />
          } @else { <ui-empty icon="scroll-text" [title]="'no_data' | t" /> }
        }
      </div>
    </div>

    @if (detail(); as l) {
      <ui-modal size="lg" [title]="l.action" [subtitle]="(l.entity || '') + ' ' + (l.entityId || '')" (closed)="detail.set(null)">
        <div class="grid two">
          <div>
            <b class="small">{{ 'old_value' | t }}</b>
            <pre class="json">{{ pretty(l.oldValue) }}</pre>
          </div>
          <div>
            <b class="small">{{ 'new_value' | t }}</b>
            <pre class="json">{{ pretty(l.newValue) }}</pre>
          </div>
        </div>
        <div class="divider"></div>
        <div class="small text-3">{{ 'device' | t }}: {{ l.device || '—' }}</div>
        <div footer><button class="btn" type="button" (click)="detail.set(null)">{{ 'close' | t }}</button></div>
      </ui-modal>
    }
  `,
  styles: [`
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .json { background: var(--surface-3); border: 1px solid var(--border); border-radius: var(--r); padding: 11px; font-family: var(--ff-mono); font-size: 11.5px; overflow: auto; max-height: 320px; margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
  `],
})
export class AuditComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  search = ''; action = ''; from = ''; to = '';
  readonly page = signal(1);
  readonly limit = signal(20);
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
      next: (d) => { this.data.set(d); this.loading.set(false); },
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
