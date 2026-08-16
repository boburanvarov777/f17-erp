import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TPipe } from '../pipes/t.pipe';

@Component({
  selector: 'ui-pagination',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagination">
      <div class="small text-3">
        {{ 'showing' | t: { from: from(), to: to(), total: total() } }}
      </div>
      <div class="row gap-3">
        <select class="select btn-sm" style="width:auto;height:32px" [value]="limit()" (change)="limitChange.emit(+$any($event.target).value)">
          @for (n of [10, 20, 50, 100]; track n) { <option [value]="n">{{ n }}</option> }
        </select>
        <div class="pager">
          <button type="button" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)" [attr.data-tip]="'prev_page' | t">‹</button>
          @for (p of pages(); track p) {
            @if (p === -1) { <button type="button" disabled>…</button> }
            @else { <button type="button" [class.active]="p === page()" (click)="pageChange.emit(p)" [attr.data-tip]="('page' | t) + ' ' + p">{{ p }}</button> }
          }
          <button type="button" [disabled]="page() >= totalPages()" (click)="pageChange.emit(page() + 1)" [attr.data-tip]="'next_page' | t">›</button>
        </div>
      </div>
    </div>
  `,
})
export class PaginationComponent {
  readonly page = input(1);
  readonly limit = input(20);
  readonly total = input(0);
  readonly totalPages = input(1);
  readonly pageChange = output<number>();
  readonly limitChange = output<number>();

  readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1));
  readonly to = computed(() => Math.min(this.total(), this.page() * this.limit()));

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
}
