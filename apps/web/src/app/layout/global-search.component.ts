import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { GlobalSearchResult } from '../core/models';
import { ApiService } from '../core/services/api.service';
import { TPipe } from '../shared/pipes/t.pipe';
import { IconComponent } from '../shared/ui/icon.component';

interface Hit { icon: string; title: string; sub: string; link: string; group: string; }

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [FormsModule, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="palette-backdrop" (click)="onBackdrop($event)">
      <div class="palette">
        <div class="palette-input">
          <ui-icon name="search" [size]="18" />
          <input #box class="grow" [(ngModel)]="query" (ngModelChange)="onQuery($event)"
                 [placeholder]="'search_placeholder' | t" autocomplete="off" />
          @if (loading()) { <span class="spinner"></span> }
          <span class="kbd">ESC</span>
        </div>

        <div class="palette-body">
          @if (hits().length) {
            @for (h of hits(); track h.link + h.title; let i = $index) {
              <button class="hit" type="button" [class.sel]="i === selected()" (click)="go(h)" (mouseenter)="selected.set(i)">
                <span class="hit-ic"><ui-icon [name]="h.icon" [size]="16" /></span>
                <span class="grow" style="min-width:0">
                  <span class="hit-t truncate">{{ h.title }}</span>
                  <span class="hit-s truncate">{{ h.sub }}</span>
                </span>
                <span class="badge badge-neutral">{{ h.group }}</span>
              </button>
            }
          } @else if (query.length >= 2 && !loading()) {
            <div class="empty" style="padding:36px"><span class="small">{{ 'no_data' | t }}</span></div>
          } @else {
            <div class="hint">
              <div class="small text-3">Zakaz raqami, model kodi, mijoz, material yoki xodim bo‘yicha qidiring.</div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .palette-backdrop { position: fixed; inset: 0; background: var(--overlay); z-index: 300; display: flex; justify-content: center; padding: 10vh 20px 20px; backdrop-filter: blur(2px); animation: fade .12s ease; }
    .palette { width: 100%; max-width: 620px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); box-shadow: var(--sh-4); overflow: hidden; height: fit-content; max-height: 70vh; display: flex; flex-direction: column; animation: pop .15s cubic-bezier(.2,.8,.3,1); }
    .palette-input { display: flex; align-items: center; gap: 11px; padding: 15px 17px; border-bottom: 1px solid var(--border); color: var(--text-3); }
    .palette-input input { border: none; outline: none; background: none; font-size: 15px; color: var(--text); }
    .palette-body { overflow-y: auto; padding: 6px; }
    .hit { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 11px; border: none; background: none; border-radius: var(--r); cursor: pointer; text-align: left; }
    .hit.sel { background: var(--surface-3); }
    .hit-ic { width: 30px; height: 30px; border-radius: 7px; background: var(--primary-50); color: var(--primary); display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
    .hit-t { display: block; font-size: 13.5px; font-weight: 500; }
    .hit-s { display: block; font-size: 11.5px; color: var(--text-3); }
    .hint { padding: 30px 20px; text-align: center; }
  `],
})
export class GlobalSearchComponent {
  private api = inject(ApiService);
  private router = inject(Router);

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
    return [
      ...r.orders.map((o) => ({ icon: 'clipboard-list', title: o.number, sub: `${o.qty} dona · ${o.model?.code ?? ''}`, link: `/orders/${o.id}`, group: 'Zakaz' })),
      ...r.models.map((m) => ({ icon: 'shirt', title: `${m.code} — ${m.name}`, sub: m.category ?? '', link: `/models/${m.id}`, group: 'Model' })),
      ...r.clients.map((c) => ({ icon: 'building', title: c.name, sub: c.code, link: `/orders?clientId=${c.id}`, group: 'Mijoz' })),
      ...r.materials.map((m) => ({ icon: 'boxes', title: m.name, sub: `${m.code} · ${m.stock} ${m.unit ?? ''}`, link: `/warehouse?search=${m.code}`, group: 'Ombor' })),
      ...r.users.map((u) => ({ icon: 'user', title: `${u.lastName} ${u.firstName}`, sub: u.position ?? '', link: `/users?search=${u.lastName}`, group: 'Xodim' })),
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
