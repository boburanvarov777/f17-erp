import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ScheduleBar, ScheduleRow, StageType } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { EmptyComponent } from '../../../../shared/ui/empty/empty.component';
import { LoadingComponent } from '../../../../shared/ui/loading/loading.component';
import { DateInputComponent } from '../../../../shared/ui/date-input.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge/status-badge.component';
import { IconComponent } from '../../../../shared/ui/icon.component';

const STAGE_COLOR: Record<StageType, string> = {
  CUTTING: '#3b82f6', SEWING: '#22c55e', WASHING: '#06b6d4',
  LASER: '#eab308', PACKING: '#a855f7', LOADING: '#ef4444',
};

type ViewPreset = 'all' | 'custom';
type ScheduleTab = 'gantt' | 'table';

interface DayCol { ts: number; day: number; month: string; isToday: boolean; }

/** An inclusive window of waiting days drawn on the calendar. */
interface Gap {
  from: Date;
  to: Date;
  days: number;
}

/** Days between the order being accepted and the first real production output. */
interface IdleGap extends Gap {
  /** Null while nothing has been produced yet, so the gap runs to the plan start. */
  workStart: Date | null;
}

interface Anchor {
  ax: number;
  ay: number;
  arrow: number;
  below: boolean;
}

interface TipCtx extends Anchor {
  row: ScheduleRow;
  bar: ScheduleBar | null;
}

interface HelpCtx extends Anchor {
  title: string;
  text: string;
}

const META_W = 720;
/** Bold 10px tabular digits: average advance width + inner padding. */
const TAG_CHAR_W = 7.2;
const TAG_PAD = 14;
/** Zoom bounds: the auto fit never goes below its own floor, manual zoom may. */
const DAY_W_MIN = 14;
const DAY_W_MIN_AUTO = 30;
const DAY_W_MAX = 96;
const ZOOM_STEP = 6;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDayTs(d: string | Date): number {
  if (typeof d === 'string') {
    const iso = d.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return parseDay(iso).getTime();
  }
  const x = new Date(d);
  return parseDay(fmtIso(x)).getTime();
}

function laterDay(a: string | Date | null | undefined, b: string | Date): string | Date {
  if (!a) return b;
  return toDayTs(a) >= toDayTs(b) ? a : b;
}

/** Calendar days from start through end, inclusive. */
function inclusiveDays(a: string | Date, b: string | Date): number {
  const da = toDayTs(a);
  const db = toDayTs(b);
  return Math.max(1, Math.round((db - da) / 864e5) + 1);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, StatusBadgeComponent, EmptyComponent, LoadingComponent, DateInputComponent, TPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);

  readonly stages: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];
  readonly tabItems = [
    { key: 'gantt' as const, label: 'schedule_tab_gantt' },
    { key: 'table' as const, label: 'schedule_tab_table' },
  ];
  readonly viewPresets = [
    { key: 'all' as const, label: 'schedule_range_all' },
  ];
  /** Legend entries that stand for a pattern, each with a hover explanation. */
  readonly legendNotes = [
    { key: 'plan', label: 'schedule_plan', desc: 'schedule_h_plan_d' },
    { key: 'fact', label: 'schedule_fact', desc: 'schedule_h_fact_d' },
    { key: 'idle', label: 'schedule_idle', desc: 'schedule_h_idle_d' },
    { key: 'open', label: 'schedule_order_open', desc: 'schedule_h_open_d' },
  ];

  readonly activeTab = signal<ScheduleTab>('gantt');
  readonly viewPreset = signal<ViewPreset>('all');
  readonly rows = signal<ScheduleRow[]>([]);
  readonly loading = signal(false);
  readonly collapsed = signal<Set<string>>(new Set());
  readonly tip = signal<TipCtx | null>(null);
  readonly help = signal<HelpCtx | null>(null);
  /** Explicit zoom level, or null while the width follows the auto label fit. */
  readonly dayWidth = signal<number | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly showLegend = signal(true);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly from = signal('');
  readonly to = signal('');

  constructor() {
    this.applyViewPreset('all');
  }

  /** Timeline = exactly [from … to] inclusive, no extra days. */
  private span(): { s: number; e: number } {
    const from = this.from();
    const to = this.to();
    if (!from || !to) {
      const t = toDayTs(new Date());
      return { s: t, e: t + 864e5 };
    }
    const s = parseDay(from).getTime();
    let toDay = parseDay(to);
    if (toDay.getTime() < s) toDay = parseDay(from);
    const e = toDay.getTime() + 864e5;
    return { s, e };
  }

  readonly days = computed<DayCol[]>(() => {
    const { s, e } = this.span();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out: DayCol[] = [];
    for (let t = s; t < e; t += 864e5) {
      const d = new Date(t);
      out.push({
        ts: t,
        day: d.getDate(),
        month: `${this.i18n.t(`mos_${d.getMonth() + 1}`)} ${d.getFullYear()}`,
        isToday: d.getTime() === today.getTime(),
      });
    }
    return out;
  });

  /** Narrowest day column that still fits every visible bar label inside its bar. */
  private readonly autoDayW = computed(() => {
    const { s, e } = this.span();
    let min = DAY_W_MIN_AUTO;
    for (const r of this.pagedRows()) {
      const bump = (label: string, a: string | Date, b: string | Date) => {
        const start = Math.max(s, toDayTs(a));
        const end = Math.min(e - 864e5, toDayTs(b));
        if (end < start) return;
        const days = Math.round((end - start) / 864e5) + 1;
        min = Math.max(min, Math.ceil((label.length * TAG_CHAR_W + TAG_PAD) / days));
      };
      if (!this.isCollapsed(r.id)) {
        for (const b of r.bars) {
          bump(`${b.doneQty}/${b.planQty}`, this.barFrom(b), this.barTo(b));
        }
      }
    }
    return Math.min(DAY_W_MAX, Math.max(DAY_W_MIN_AUTO, min));
  });

  readonly dayW = computed(() => this.dayWidth() ?? this.autoDayW());

  /** True while the width matches the label fit, even if it was set by hand. */
  readonly autoFit = computed(() => {
    const w = this.dayWidth();
    return w === null || w === this.autoDayW();
  });

  readonly timelineWidth = computed(() => this.days().length * this.dayW());

  readonly sheetWidth = computed(() => META_W + this.timelineWidth());

  readonly monthSpans = computed(() => {
    const days = this.days();
    const w = this.dayW();
    const spans: { label: string; start: number; width: number }[] = [];
    let i = 0;
    while (i < days.length) {
      let j = i + 1;
      while (j < days.length && days[j].month === days[i].month) j++;
      spans.push({ label: days[i].month, start: i * w, width: (j - i) * w });
      i = j;
    }
    return spans;
  });

  readonly todayLeft = computed(() => {
    const idx = this.days().findIndex((d) => d.isToday);
    if (idx < 0) return null;
    return idx * this.dayW() + this.dayW() / 2;
  });

  readonly filteredRows = computed(() => {
    let list = this.rows();
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.number.toLowerCase().includes(q)
        || (r.model ?? '').toLowerCase().includes(q)
        || (r.client ?? '').toLowerCase().includes(q),
      );
    }
    const st = this.statusFilter();
    if (st) list = list.filter((r) => r.status === st);
    return list;
  });

  onSearchChange(v: string): void {
    this.search.set(v);
    this.page.set(1);
  }

  onStatusChange(v: string): void {
    this.statusFilter.set(v);
    this.page.set(1);
  }

  readonly pagedRows = computed(() => {
    const all = this.filteredRows();
    const start = (this.page() - 1) * this.pageSize();
    return all.slice(start, start + this.pageSize());
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize())),
  );

  /** Lets the loaded data decide the timeline span instead of a fixed window. */
  applyViewPreset(key: ViewPreset): void {
    if (key !== 'all') return;
    this.viewPreset.set('all');
    this.dayWidth.set(null);
    this.from.set('');
    this.to.set('');
    this.load();
  }

  onFromChange(v: string): void {
    this.from.set(v);
    this.onRangeInput();
  }

  onToChange(v: string): void {
    this.to.set(v);
    this.onRangeInput();
  }

  private onRangeInput(): void {
    this.viewPreset.set('custom');
    const from = this.from();
    const to = this.to();
    if (from && to && parseDay(to) < parseDay(from)) this.to.set(from);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.page.set(1);
    this.hideTipNow();
    this.api.get<ScheduleRow[]>('/orders/schedule', { from: this.from(), to: this.to() }).subscribe({
      next: (r) => {
        if (this.viewPreset() === 'all') this.fitRangeToRows(r);
        this.rows.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Widen the timeline so every loaded plan and work window is drawable. */
  private fitRangeToRows(rows: ScheduleRow[]): void {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (!rows.length) {
      this.from.set(fmtIso(startOfMonth(now)));
      this.to.set(fmtIso(endOfMonth(now)));
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      min = Math.min(min, toDayTs(r.start));
      max = Math.max(max, toDayTs(r.end));
      for (const b of r.bars) {
        min = Math.min(min, toDayTs(this.barFrom(b)));
        max = Math.max(max, toDayTs(this.barTo(b)));
      }
    }
    this.from.set(fmtIso(new Date(min)));
    this.to.set(fmtIso(new Date(max)));
  }

  /** Steps off the auto fit, starting from whatever width is on screen now. */
  zoom(dir: -1 | 1): void {
    const next = this.dayW() + dir * ZOOM_STEP;
    this.dayWidth.set(Math.min(DAY_W_MAX, Math.max(DAY_W_MIN, next)));
  }

  canZoom(dir: -1 | 1): boolean {
    const w = this.dayW();
    return dir < 0 ? w > DAY_W_MIN : w < DAY_W_MAX;
  }

  /** Back to the width that keeps every bar label inside its bar. */
  fitZoom(): void {
    this.dayWidth.set(null);
  }

  barQtyPct(b: ScheduleBar): number {
    if (!b.planQty) return 0;
    return Math.min(100, Math.round((b.doneQty / b.planQty) * 100));
  }

  barComplete(b: ScheduleBar): boolean {
    return b.planQty > 0 && b.doneQty >= b.planQty;
  }

  /** Nothing produced yet, so the window is still just waiting time. */
  barPending(b: ScheduleBar): boolean {
    return b.doneQty <= 0;
  }

  /**
   * Idle window per order: accepted date through the day before the first
   * recorded output. Cached so hover keeps a stable object identity.
   */
  private readonly idleGaps = computed(() => {
    const map = new Map<string, IdleGap>();
    for (const r of this.rows()) {
      let firstBar: number | null = null;
      let firstWork: number | null = null;
      for (const b of r.bars) {
        const bar = toDayTs(this.barFrom(b));
        if (firstBar === null || bar < firstBar) firstBar = bar;
        const at = b.firstEntryAt ?? (b.doneQty > 0 ? b.workStart : null);
        if (!at) continue;
        const ts = toDayTs(at);
        if (firstWork === null || ts < firstWork) firstWork = ts;
      }
      if (firstBar === null) continue;
      // Idle time may never overlap a drawn bar, so the earliest one caps it.
      const first = firstWork === null ? firstBar : Math.min(firstWork, firstBar);
      const accepted = toDayTs(r.start);
      if (first <= accepted) continue;
      const to = first - 864e5;
      map.set(r.id, {
        from: new Date(accepted),
        to: new Date(to),
        workStart: firstWork === null ? null : new Date(firstWork),
        days: Math.round((to - accepted) / 864e5) + 1,
      });
    }
    return map;
  });

  idleGap(r: ScheduleRow): IdleGap | undefined {
    return this.idleGaps().get(r.id);
  }

  /**
   * Per unfinished stage: the stretch from the day after the previous stage
   * ended through today, so a stage that drags on stays visible on the chart.
   */
  private readonly stageWaits = computed(() => {
    const map = new Map<string, Gap>();
    const today = toDayTs(new Date());
    for (const r of this.rows()) {
      const accepted = toDayTs(r.start);
      let prevEnd = accepted - 864e5;
      for (const b of r.bars) {
        const from = Math.max(prevEnd + 864e5, accepted);
        prevEnd = toDayTs(this.barTo(b));
        if (this.barComplete(b) || today < from) continue;
        map.set(`${r.id}:${b.stage}`, {
          from: new Date(from),
          to: new Date(today),
          days: Math.round((today - from) / 864e5) + 1,
        });
      }
    }
    return map;
  });

  stageWait(r: ScheduleRow, b: ScheduleBar): Gap | undefined {
    return this.stageWaits().get(`${r.id}:${b.stage}`);
  }

  /** Order row: the stretch from the last stage window through today while open. */
  private readonly orderTails = computed(() => {
    const map = new Map<string, Gap>();
    const today = toDayTs(new Date());
    for (const r of this.rows()) {
      if (!r.bars.length || r.bars.every((b) => this.barComplete(b))) continue;
      const accepted = toDayTs(r.start);
      let last = accepted - 864e5;
      for (const b of r.bars) last = Math.max(last, toDayTs(this.barTo(b)));
      const from = Math.max(last + 864e5, accepted);
      if (today < from) continue;
      map.set(r.id, {
        from: new Date(from),
        to: new Date(today),
        days: Math.round((today - from) / 864e5) + 1,
      });
    }
    return map;
  });

  orderTail(r: ScheduleRow): Gap | undefined {
    return this.orderTails().get(r.id);
  }

  /** Single window per stage: real work dates once they exist, plan dates otherwise. */
  barFrom(b: ScheduleBar): string | Date {
    return b.workStart ?? b.start;
  }

  /**
   * A closed stage ends the day it was closed. An open one runs to its planned
   * end even if the last entry is older, so the chain keeps no empty columns.
   */
  barTo(b: ScheduleBar): string | Date {
    const from = this.barFrom(b);
    const to = b.finishedAt
      ?? (this.barComplete(b) ? (b.workEnd ?? b.end) : laterDay(b.workEnd, b.end));
    return toDayTs(to) < toDayTs(from) ? from : to;
  }

  /** True when the label needs to sit next to the bar instead of inside it. */
  tagOutside(label: string, a: string | Date, b: string | Date): boolean {
    return this.widthPx(a, b) < label.length * TAG_CHAR_W + TAG_PAD;
  }

  private tipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private tipHover = false;
  private lastTipKey = '';

  isCollapsed(id: string): boolean { return this.collapsed().has(id); }

  toggleRow(id: string): void {
    this.collapsed.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  leftPx(d: string | Date): number {
    const { s } = this.span();
    const t = Math.max(s, toDayTs(d));
    const idx = Math.round((t - s) / 864e5);
    return Math.max(0, idx * this.dayW());
  }

  widthPx(a: string | Date, b: string | Date): number {
    const { s, e } = this.span();
    const start = Math.max(s, toDayTs(a));
    const end = Math.min(e - 864e5, toDayTs(b));
    if (end < start) return 0;
    const days = Math.round((end - start) / 864e5) + 1;
    return days * this.dayW();
  }

  /** False when the plan window falls completely outside the picked date range. */
  barVisible(a: string | Date, b: string | Date): boolean {
    const { s, e } = this.span();
    return toDayTs(b) >= s && toDayTs(a) <= e - 864e5;
  }

  color(stage: StageType): string { return STAGE_COLOR[stage]; }

  /** dd.MM.yyyy in every language, matching the rest of the app. */
  fmtDay(d: string | Date | null | undefined): string {
    if (!d) return '—';
    const x = new Date(d);
    return `${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.${x.getFullYear()}`;
  }

  fmtDateTime(d: string | Date | null | undefined): string {
    if (!d) return '—';
    const x = new Date(d);
    return `${this.fmtDay(x)}, ${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
  }

  daysBetween(a: string | Date, b: string | Date): number {
    return inclusiveDays(a, b);
  }

  orderProgress(r: ScheduleRow): number {
    if (!r.bars.length) return 0;
    return Math.round(r.bars.reduce((a, b) => a + b.progress, 0) / r.bars.length);
  }

  showTip(row: ScheduleRow, bar: ScheduleBar | null, ev: MouseEvent): void {
    if (this.tipHideTimer) {
      clearTimeout(this.tipHideTimer);
      this.tipHideTimer = null;
    }
    const key = bar ? `${row.id}:${bar.stage}` : row.id;
    if (key === this.lastTipKey && this.tip()) return;

    const pos = bar
      ? this.anchor(ev, 320, 230)
      : this.anchor(ev, Math.min(1040, window.innerWidth - 24), 300);
    if (!pos) return;
    this.lastTipKey = key;
    this.tip.set({ row, bar, ...pos });
  }

  showHelp(titleKey: string, descKey: string, ev: Event): void {
    const pos = this.anchor(ev, 300, 150);
    if (pos) this.help.set({ title: this.i18n.t(titleKey), text: this.i18n.t(descKey), ...pos });
  }

  hideHelp(): void {
    this.help.set(null);
  }

  /**
   * Anchors a fixed popover to the hovered element. Prefers above, flips below,
   * and when neither side fits it pins the popover inside the viewport so the
   * content is never cut off by the window edge.
   */
  private anchor(ev: Event, w: number, h: number): Anchor | null {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return null;

    // Viewport coordinates: popovers are fixed so no scroll box can clip them.
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = r.left + r.width / 2;
    const ax = Math.max(8, Math.min(cx - w / 2, vw - w - 8));
    const arrow = Math.max(16, Math.min(cx - ax, w - 16));

    if (r.top - h - 12 >= 0) return { ax, ay: r.top - 10, arrow, below: false };
    if (r.bottom + h + 12 <= vh) return { ax, ay: r.bottom + 10, arrow, below: true };
    return { ax, ay: Math.max(12, (vh - h) / 2), arrow, below: true };
  }

  hideTip(): void {
    if (this.tipHover) return;
    if (this.tipHideTimer) clearTimeout(this.tipHideTimer);
    this.tipHideTimer = setTimeout(() => {
      if (!this.tipHover) {
        this.tip.set(null);
        this.lastTipKey = '';
      }
      this.tipHideTimer = null;
    }, 220);
  }

  hideTipNow(): void {
    if (this.tipHideTimer) clearTimeout(this.tipHideTimer);
    this.tipHideTimer = null;
    this.tipHover = false;
    this.lastTipKey = '';
    this.tip.set(null);
  }

  onTipEnter(): void {
    this.tipHover = true;
    if (this.tipHideTimer) {
      clearTimeout(this.tipHideTimer);
      this.tipHideTimer = null;
    }
  }

  onTipLeave(): void {
    this.tipHover = false;
    this.hideTip();
  }

  onChartScroll(): void {
    this.hideTipNow();
    this.hideHelp();
  }

  defectRate(b: ScheduleBar): number {
    if (!b.doneQty) return 0;
    return Math.round(((b.defectQty ?? 0) / b.doneQty) * 100);
  }

  toggleLegend(): void { this.showLegend.update((v) => !v); }

  setTab(key: ScheduleTab): void {
    this.activeTab.set(key);
    this.hideTip();
  }

  pageEnd(): number {
    return Math.min(this.page() * this.pageSize(), this.filteredRows().length);
  }

  isViewActive(key: ViewPreset): boolean {
    return this.viewPreset() === key;
  }
}
