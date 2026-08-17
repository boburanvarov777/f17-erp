import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TPipe } from '../pipes/t.pipe';

const LIMIT_OPTIONS = [10, 20, 50, 100] as const;

@Component({
  selector: 'ui-pagination',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="paginator">
      <div class="paginator-report small text-3">
        {{ 'showing' | t: { from: from(), to: to(), total: total() } }}
      </div>

      <div class="paginator-controls">
        <div class="paginator-rpp">
          <span class="paginator-rpp-label">{{ 'rows_per_page' | t }}</span>
          <select
            class="paginator-rpp-select select btn-sm"
            [ngModel]="limit()"
            (ngModelChange)="onLimitPick($event)"
          >
            @for (opt of limitOptions(); track opt.value) {
              <option [ngValue]="opt.value" [disabled]="opt.disabled && opt.value !== limit()">{{ opt.value }}</option>
            }
          </select>
        </div>

        @if (showPager()) {
          <nav class="paginator-pages" [attr.aria-label]="'page' | t">
            <button type="button" class="paginator-nav" [disabled]="page() <= 1" (click)="go(1)" [attr.data-tip]="'first_page' | t">«</button>
            <button type="button" class="paginator-nav" [disabled]="page() <= 1" (click)="go(page() - 1)" [attr.data-tip]="'prev_page' | t">‹</button>
            @for (p of pages(); track $index) {
              @if (p === -1) {
                <span class="paginator-ellipsis">…</span>
              } @else {
                <button
                  type="button"
                  class="paginator-page"
                  [class.active]="p === page()"
                  (click)="go(p)"
                  [attr.data-tip]="('page' | t) + ' ' + p"
                >{{ p }}</button>
              }
            }
            <button type="button" class="paginator-nav" [disabled]="page() >= totalPages()" (click)="go(page() + 1)" [attr.data-tip]="'next_page' | t">›</button>
            <button type="button" class="paginator-nav" [disabled]="page() >= totalPages()" (click)="go(totalPages())" [attr.data-tip]="'last_page' | t">»</button>
          </nav>
        }
      </div>
    </div>
  `,
  styles: [`
    .paginator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
      background: var(--surface-2);
    }
    .paginator-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-left: auto;
    }
    .paginator-rpp {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .paginator-rpp-label {
      font-size: 13px;
      color: var(--text-3);
      white-space: nowrap;
    }
    .paginator-rpp-select {
      width: auto;
      min-width: 72px;
      height: 32px;
      padding: 0 28px 0 10px;
      font-size: 13px;
      cursor: pointer;
    }
    .paginator-rpp-select option:disabled {
      color: var(--text-3);
    }
    .paginator-pages {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .paginator-nav,
    .paginator-page {
      min-width: 32px;
      height: 32px;
      padding: 0 6px;
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      background: var(--surface);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      transition: background .15s, border-color .15s, color .15s;
    }
    .paginator-nav:hover:not(:disabled),
    .paginator-page:hover:not(.active) { background: var(--surface-3); }
    .paginator-page.active {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
      font-weight: 600;
    }
    .paginator-nav:disabled { opacity: .4; cursor: not-allowed; }
    .paginator-ellipsis {
      min-width: 24px;
      text-align: center;
      color: var(--text-3);
      font-size: 13px;
      user-select: none;
    }
    @media (max-width: 640px) {
      .paginator { flex-direction: column; align-items: stretch; }
      .paginator-controls { margin-left: 0; justify-content: space-between; }
    }
  `],
})
export class PaginationComponent {
  readonly page = input(1);
  readonly limit = input(10);
  readonly total = input(0);
  readonly totalPages = input(1);
  readonly pageChange = output<number>();
  readonly limitChange = output<number>();

  readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1));
  readonly to = computed(() => Math.min(this.total(), this.page() * this.limit()));

  /**
   * A page size is offered while the next smaller one still leaves rows uncovered,
   * so the enabled range ends at the first size that fits the whole result set.
   * Example: total 13 → 10 and 20 enabled, 50 and 100 disabled.
   */
  readonly limitOptions = computed(() => {
    const total = this.total();
    const current = this.limit();
    const values = [...new Set<number>([...LIMIT_OPTIONS, current])].sort((a, b) => a - b);

    return values.map((value, i) => ({
      value,
      disabled: !(value === current || (total > 0 && (values[i - 1] ?? 0) < total)),
    }));
  });

  /** Show page controls whenever there is data (PrimeNG-style — page 1 always visible). */
  readonly showPager = computed(() => this.total() > 0);

  readonly pages = computed<number[]>(() => {
    const total = this.totalPages();
    const cur = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: number[] = [1];
    if (cur > 3) out.push(-1);
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
    if (cur < total - 2) out.push(-1);
    out.push(total);
    return out;
  });

  onLimitPick(value: number): void {
    if (value === this.limit()) return;
    if (this.limitOptions().find((o) => o.value === value)?.disabled) return;
    this.limitChange.emit(value);
  }

  go(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages());
    if (next !== this.page()) this.pageChange.emit(next);
  }
}
