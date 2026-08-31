import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ScheduleRow, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const STAGE_COLOR: Record<StageType, string> = {
  CUTTING: '#3f6cba', SEWING: '#2f8f6d', WASHING: '#4a86c9',
  LASER: '#b8873a', PACKING: '#7c5cc4', LOADING: '#c2694f',
};

interface Tick { label: string; left: number; major: boolean; }

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
  standalone: true,
  imports: [FormsModule, RouterLink, StatusBadgeComponent, EmptyComponent, LoadingComponent, DateInputComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
