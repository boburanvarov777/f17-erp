import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ScheduleRow, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const STAGE_COLOR: Record<StageType, string> = {
  CUTTING: '#3f6cba', SEWING: '#2f8f6d', WASHING: '#4a86c9',
  LASER: '#b8873a', PACKING: '#7c5cc4', LOADING: '#c2694f',
};

interface Tick { label: string; left: number; major: boolean; }

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadgeComponent, EmptyComponent, LoadingComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'schedule_title' | t }}</div>
          <div class="sub">{{ i18n.t('schedule_count_sub', { n: rows().length, from, to }) }}</div>
        </div>
        <div class="row gap-2">
          <div class="seg">
            @for (v of views; track v.key) {
              <button type="button" [class.on]="view() === v.key" (click)="setView(v.key)">{{ v.label | t }}</button>
            }
          </div>
          <input class="input btn-sm" style="width:150px;height:32px" type="date" [(ngModel)]="from" (ngModelChange)="load()" />
          <input class="input btn-sm" style="width:150px;height:32px" type="date" [(ngModel)]="to" (ngModelChange)="load()" />
        </div>
      </div>

      <div class="card">
        <div class="legend">
          @for (s of stages; track s) {
            <span class="lg"><i [style.background]="color(s)"></i>{{ 'stage_' + s | t }}</span>
          }
        </div>

        @if (loading()) { <ui-loading [count]="8" [height]="34" /> }
        @else if (!rows().length) { <ui-empty icon="calendar-range" [title]="'no_orders' | t" /> }
        @else {
          <div class="gantt">
            <div class="g-head">
              <div class="g-left">{{ 'order' | t }}</div>
              <div class="g-track">
                @for (t of ticks(); track t.left) {
                  <span class="tick" [class.major]="t.major" [style.left.%]="t.left">{{ t.label }}</span>
                }
                <span class="nowline" [style.left.%]="nowLeft()"></span>
              </div>
            </div>

            @for (r of rows(); track r.id) {
              <div class="g-row">
                <div class="g-left">
                  <a class="mono bold small" [routerLink]="['/orders', r.id]">{{ r.number }}</a>
                  <div class="tiny text-3 truncate">{{ r.model || r.client }}</div>
                  <div class="row gap-2 mt-2"><ui-status [value]="r.status" /></div>
                </div>
                <div class="g-track">
                  @for (t of ticks(); track t.left) { <span class="grid-line" [class.major]="t.major" [style.left.%]="t.left"></span> }
                  <span class="nowline" [style.left.%]="nowLeft()"></span>
                  @for (b of r.bars; track b.stage) {
                    <div class="bar"
                         [style.left.%]="left(b.start)"
                         [style.width.%]="width(b.start, b.end)"
                         [style.background]="color(b.stage)"
                         [style.opacity]="b.status === 'NOT_STARTED' ? .35 : 1"
                         [attr.data-tip]="('stage_' + b.stage | t) + ' — ' + b.doneQty + '/' + b.planQty + ' (' + b.progress + '%)'">
                      <span class="bar-fill" [style.width.%]="b.progress"></span>
                      <span class="bar-label">{{ 'stage_' + b.stage | t }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--r); overflow: hidden; }
    .seg button { border: none; background: var(--surface); padding: 7px 13px; cursor: pointer; color: var(--text-2); font-size: 13px; }
    .seg button.on { background: var(--primary); color: #fff; font-weight: 600; }
    .legend { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .lg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }
    .lg i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }

    .gantt { overflow-x: auto; }
    .g-head, .g-row { display: flex; min-width: 900px; }
    .g-head { position: sticky; top: 0; background: var(--surface-2); border-bottom: 1px solid var(--border); z-index: 2; height: 34px; }
    .g-left { width: 210px; flex: 0 0 auto; padding: 8px 14px; border-right: 1px solid var(--border); font-size: 11.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; }
    .g-row .g-left { text-transform: none; letter-spacing: 0; color: inherit; padding: 10px 14px; }
    .g-row { border-bottom: 1px solid var(--border); }
    .g-row:hover { background: var(--surface-2); }
    .g-track { position: relative; flex: 1; min-height: 34px; padding: 8px 0; }
    .tick { position: absolute; top: 9px; font-size: 10.5px; color: var(--text-3); transform: translateX(-50%); white-space: nowrap; }
    .tick.major { font-weight: 600; color: var(--text-2); }
    .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border); opacity: .5; }
    .grid-line.major { opacity: 1; }
    .nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--danger); opacity: .6; z-index: 1; }
    .bar { position: absolute; height: 15px; border-radius: 4px; overflow: hidden; min-width: 6px; display: flex; align-items: center; }
    .bar:nth-child(4n) { top: 8px; } 
    .bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,255,255,.35); }
    .bar-label { position: relative; font-size: 9.5px; color: #fff; padding: 0 5px; white-space: nowrap; overflow: hidden; font-weight: 500; }
  `],
})
export class ScheduleComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);

  readonly stages: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];
  readonly views = [
    { key: 'day', label: 'view_day' },
    { key: 'week', label: 'view_week' },
    { key: 'month', label: 'view_month' },
  ];

  readonly view = signal<string>('month');
  readonly rows = signal<ScheduleRow[]>([]);
  readonly loading = signal(false);

  from = '';
  to = '';

  constructor() {
    this.setView('month');
  }

  setView(v: string): void {
    this.view.set(v);
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    if (v === 'day') { start.setDate(now.getDate() - 2); end.setDate(now.getDate() + 5); }
    if (v === 'week') { start.setDate(now.getDate() - 7); end.setDate(now.getDate() + 21); }
    if (v === 'month') { start.setDate(now.getDate() - 20); end.setMonth(now.getMonth() + 3); }
    this.from = start.toISOString().slice(0, 10);
    this.to = end.toISOString().slice(0, 10);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<ScheduleRow[]>('/orders/schedule', { from: this.from, to: this.to }).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private span(): { s: number; e: number } {
    const s = +new Date(this.from);
    const e = +new Date(this.to);
    return { s, e: e > s ? e : s + 864e5 };
  }

  left(d: string | Date): number {
    const { s, e } = this.span();
    return Math.max(0, Math.min(100, ((+new Date(d) - s) / (e - s)) * 100));
  }

  width(a: string | Date, b: string | Date): number {
    const { s, e } = this.span();
    const w = ((+new Date(b) - +new Date(a)) / (e - s)) * 100;
    return Math.max(1.2, Math.min(100 - this.left(a), w));
  }

  readonly nowLeft = computed(() => {
    const { s, e } = this.span();
    return Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100));
  });

  readonly ticks = computed<Tick[]>(() => {
    const { s, e } = this.span();
    const days = Math.ceil((e - s) / 864e5);
    const step = days <= 10 ? 1 : days <= 40 ? 7 : 14;
    const out: Tick[] = [];
    for (let i = 0; i <= days; i += step) {
      const d = new Date(s + i * 864e5);
      out.push({
        label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
        left: (i / days) * 100,
        major: d.getDate() <= step,
      });
    }
    return out;
  });

  color(stage: StageType): string { return STAGE_COLOR[stage]; }
}
