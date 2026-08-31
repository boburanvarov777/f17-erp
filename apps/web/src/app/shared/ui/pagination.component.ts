import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TPipe } from '../pipes/t.pipe';

const LIMIT_OPTIONS = [10, 20, 50, 100] as const;

@Component({
  selector: 'ui-pagination',
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
  standalone: true,
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
