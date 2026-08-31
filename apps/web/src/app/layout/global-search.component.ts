import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { GlobalSearchResult } from '../core/models';
import { ApiService } from '../core/services/api.service';
import { I18nService } from '../core/services/i18n.service';
import { TPipe } from '../shared/pipes/t.pipe';
import { IconComponent } from '../shared/ui/icon.component';

interface Hit { icon: string; title: string; sub: string; link: string; group: string; }

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearchComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private i18n = inject(I18nService);

  readonly closed = output<void>();
  @ViewChild('box', { static: true }) box!: ElementRef<HTMLInputElement>;

  query = '';
  readonly loading = signal(false);
  readonly selected = signal(0);
  readonly result = signal<GlobalSearchResult | null>(null);
  private q$ = new Subject<string>();

  readonly hits = computed<Hit[]>(() => {
    const r = this.result();
    if (!r) return [];
    const t = (k: string) => this.i18n.t(k);
    return [
      ...r.orders.map((o) => ({ icon: 'clipboard-list', title: o.number, sub: `${o.qty} ${t('pieces_short')} · ${o.model?.code ?? ''}`, link: `/orders/${o.id}`, group: t('grp_order') })),
      ...r.models.map((m) => ({ icon: 'shirt', title: `${m.code} — ${m.name}`, sub: m.category ?? '', link: `/models/${m.id}`, group: t('grp_model') })),
      ...r.clients.map((c) => ({ icon: 'building', title: c.name, sub: c.code, link: `/orders?clientId=${c.id}`, group: t('grp_client') })),
      ...r.materials.map((m) => ({ icon: 'boxes', title: m.name, sub: `${m.code} · ${m.stock} ${m.unit ?? ''}`, link: `/warehouse?search=${m.code}`, group: t('grp_warehouse') })),
      ...r.users.map((u) => ({ icon: 'user', title: `${u.lastName} ${u.firstName}`, sub: u.position ?? '', link: `/users?search=${u.lastName}`, group: t('grp_employee') })),
    ];
  });

  constructor() {
    this.q$
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((q) => {
          this.loading.set(true);
          return this.api.get<GlobalSearchResult>('/search', { q });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.selected.set(0);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    queueMicrotask(() => this.box?.nativeElement.focus());
  }

  onQuery(q: string): void {
    if (q.trim().length < 2) {
      this.result.set(null);
      this.loading.set(false);
      return;
    }
    this.q$.next(q.trim());
  }

  onBackdrop(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('palette-backdrop')) this.closed.emit();
  }

  go(h: Hit): void {
    this.closed.emit();
    void this.router.navigateByUrl(h.link);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const list = this.hits();
    if (e.key === 'Escape') { e.preventDefault(); this.closed.emit(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.selected.update((i) => Math.min(list.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.selected.update((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && list[this.selected()]) { e.preventDefault(); this.go(list[this.selected()]); }
  }
}
