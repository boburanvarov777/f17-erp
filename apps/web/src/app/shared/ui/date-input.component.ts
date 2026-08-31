import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, computed, forwardRef, inject, input, signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../pipes/t.pipe';
import { IconComponent } from './icon.component';

const WEEKDAY_KEYS = ['wd_mon', 'wd_tue', 'wd_wed', 'wd_thu', 'wd_fri', 'wd_sat', 'wd_sun'] as const;

interface DayCell {
  day: number;
  iso: string;
  muted: boolean;
  today: boolean;
  selected: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function parseIsoDate(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3] };
}

function todayIso(): string {
  const n = new Date();
  return toIsoDate(n.getFullYear(), n.getMonth(), n.getDate());
}

@Component({
  selector: 'ui-date-input',
  templateUrl: './date-input.component.html',
  styleUrl: './date-input.component.scss',
  standalone: true,
  imports: [IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DateInputComponent),
    multi: true,
  }],
})
export class DateInputComponent implements ControlValueAccessor, OnDestroy {
  /** Only one calendar panel open at a time (FROM/TO pairs, forms with multiple dates). */
  private static active: DateInputComponent | null = null;

  private readonly i18n = inject(I18nService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly size = input<'md' | 'sm'>('md');
  readonly mode = input<'date' | 'datetime'>('date');
  readonly placeholder = input('');

  readonly open = signal(false);
  readonly panelAlign = signal<'left' | 'right'>('left');
  readonly disabled = signal(false);
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());
  private readonly value = signal('');
  readonly timePart = signal('09:00');

  private onChange: (v: string) => void = () => void 0;
  private onTouched: () => void = () => void 0;

  readonly locale = computed(() => this.i18n.lang());
  readonly hasValue = computed(() => !!this.value());
  readonly displayText = computed(() => {
    this.locale();
    const raw = this.value();
    if (!raw) return this.placeholder() || this.i18n.t('select_date');
    const parsed = parseIsoDate(raw);
    if (!parsed) return raw;
    let text = this.formatDateLabel(parsed.d, parsed.m, parsed.y);
    if (this.mode() === 'datetime') text += ` · ${this.timePart()}`;
    return text;
  });

  readonly monthLabel = computed(() => {
    this.locale();
    return `${this.monthName(this.viewMonth())} ${this.viewYear()}`;
  });

  readonly weekdays = computed(() => {
    this.locale();
    return WEEKDAY_KEYS.map((k) => this.i18n.t(k));
  });

  readonly cells = computed((): DayCell[] => {
    const y = this.viewYear();
    const m = this.viewMonth();
    const selected = this.value().slice(0, 10);
    const today = todayIso();

    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad = (first.getDay() + 6) % 7;
    const cells: DayCell[] = [];

    const prevDays = new Date(y, m, 0).getDate();
    for (let i = startPad - 1; i >= 0; i--) {
      const day = prevDays - i;
      const pm = m - 1;
      const py = pm < 0 ? y - 1 : y;
      const pmNorm = (pm + 12) % 12;
      const iso = toIsoDate(py, pmNorm, day);
      cells.push({ day, iso, muted: true, today: iso === today, selected: iso === selected });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(y, m, day);
      cells.push({ day, iso, muted: false, today: iso === today, selected: iso === selected });
    }

    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const nm = m + 1;
      const ny = nm > 11 ? y + 1 : y;
      const nmNorm = nm % 12;
      const iso = toIsoDate(ny, nmNorm, nextDay);
      cells.push({ day: nextDay, iso, muted: true, today: iso === today, selected: iso === selected });
      nextDay++;
    }

    return cells;
  });

  private monthName(m: number): string {
    return this.i18n.t(`mo_${m + 1}`);
  }

  private formatDateLabel(day: number, month: number, year: number): string {
    return `${pad2(day)}.${pad2(month + 1)}.${year}`;
  }

  writeValue(v: string | null): void {
    const raw = v ?? '';
    this.value.set(raw);
    if (raw.includes('T')) this.timePart.set(raw.slice(11, 16) || '09:00');
    const parsed = parseIsoDate(raw);
    if (parsed) {
      this.viewYear.set(parsed.y);
      this.viewMonth.set(parsed.m);
    }
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  ngOnDestroy(): void {
    this.releaseActive();
  }

  toggle(): void {
    if (this.disabled()) return;
    const next = !this.open();
    if (next) {
      DateInputComponent.closeOthers(this);
      DateInputComponent.active = this;
      const parsed = parseIsoDate(this.value());
      if (parsed) {
        this.viewYear.set(parsed.y);
        this.viewMonth.set(parsed.m);
      }
      queueMicrotask(() => this.syncPanelAlign());
    } else {
      this.releaseActive();
    }
    this.open.set(next);
    this.onTouched();
  }

  private releaseActive(): void {
    if (DateInputComponent.active === this) DateInputComponent.active = null;
  }

  private static closeOthers(except: DateInputComponent): void {
    const other = DateInputComponent.active;
    if (other && other !== except) {
      other.open.set(false);
      DateInputComponent.active = null;
    }
  }

  private closePanel(): void {
    this.open.set(false);
    this.releaseActive();
  }

  private syncPanelAlign(): void {
    const panel = this.host.nativeElement.querySelector('.date-panel') as HTMLElement | null;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    this.panelAlign.set(rect.right > window.innerWidth - 8 ? 'right' : 'left');
  }

  shiftMonth(delta: number): void {
    let m = this.viewMonth() + delta;
    let y = this.viewYear();
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  pick(iso: string): void {
    this.emit(iso);
    if (this.mode() === 'date') this.closePanel();
  }

  pickToday(): void {
    this.viewYear.set(new Date().getFullYear());
    this.viewMonth.set(new Date().getMonth());
    this.pick(todayIso());
  }

  clear(): void {
    this.value.set('');
    this.onChange('');
    this.closePanel();
  }

  onTimeInput(e: Event): void {
    const t = (e.target as HTMLInputElement).value || '09:00';
    this.timePart.set(t);
    const date = this.value().slice(0, 10);
    if (date) this.emit(date);
  }

  @HostListener('document:click', ['$event'])
  onOutside(e: MouseEvent): void {
    if (!this.open()) return;
    if (!(e.target as HTMLElement).closest('.date-input')) this.closePanel();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) this.closePanel();
  }

  private emit(dateIso: string): void {
    const next = this.mode() === 'datetime' ? `${dateIso}T${this.timePart()}` : dateIso;
    this.value.set(next);
    this.onChange(next);
    const parsed = parseIsoDate(dateIso);
    if (parsed) {
      this.viewYear.set(parsed.y);
      this.viewMonth.set(parsed.m);
    }
  }
}
