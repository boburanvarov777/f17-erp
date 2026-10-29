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

/** "23.09.2026" / "23092026" / "23/9/2026" → ISO, or null when not a real date. */
function parseTyped(v: string): string | null {
  const t = v.trim();
  let d: number, m: number, y: number;
  const sep = /^(\d{1,2})[.\/\-\s](\d{1,2})[.\/\-\s](\d{4})$/.exec(t);
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (sep) { d = +sep[1]; m = +sep[2]; y = +sep[3]; }
  else if (compact) { d = +compact[1]; m = +compact[2]; y = +compact[3]; }
  else return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(y, m, 0).getDate()) return null;
  return toIsoDate(y, m - 1, d);
}

/**
 * Keeps typing in the DD.MM.YYYY shape: dots are added automatically after the
 * day and month (2309 → 23.09) and a typed separator is honoured (23.9 → 23.9).
 */
function maskTyped(v: string): string {
  const parts: string[] = [''];
  for (const ch of v) {
    const i = parts.length - 1;
    if (/\d/.test(ch)) {
      if (i < 2 && parts[i].length === 2) parts.push('');
      const j = parts.length - 1;
      if (j === 2 && parts[j].length >= 4) continue;
      parts[j] += ch;
    } else if (/[./\-\s,]/.test(ch) && parts[i] && i < 2) {
      parts.push('');
    }
  }
  return parts.join('.');
}

const PANEL_W = 336;
const GAP = 6;

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
  readonly panelPos = signal({ top: 0, left: 0, ready: false });
  /** What the text box shows — typed text while editing, formatted value otherwise. */
  readonly text = signal('');
  private editing = false;
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

  private formatIso(raw: string): string {
    const p = parseIsoDate(raw);
    return p ? this.formatDateLabel(p.d, p.m, p.y) : '';
  }

  // ── typing ──────────────────────────────────────────────
  focusText(e: MouseEvent): void {
    if (this.disabled()) return;
    if ((e.target as HTMLElement).closest('.date-icon')) return;
    (this.host.nativeElement.querySelector('.date-text') as HTMLInputElement | null)?.focus();
  }

  onTextInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const masked = maskTyped(el.value);
    if (masked !== el.value) el.value = masked;
    this.editing = true;
    this.text.set(masked);
    if (!masked.trim()) {
      this.value.set('');
      this.onChange('');
      return;
    }
    const iso = parseTyped(masked);
    if (iso) this.emit(iso); // full valid date → apply immediately, calendar follows
  }

  onTextBlur(): void {
    this.editing = false;
    const typed = this.text().trim();
    if (!typed) { this.text.set(''); this.onTouched(); return; }
    const iso = parseTyped(typed);
    if (iso) this.emit(iso);
    // Invalid or half-typed → fall back to the last good value.
    this.text.set(this.formatIso(this.value()));
    this.onTouched();
  }

  openPanel(): void {
    if (!this.open()) this.toggle();
  }

  // ── panel positioning ───────────────────────────────────
  /** Places the panel under the field, or above it when there is no room below. */
  private positionPanel(): void {
    if (!this.open()) return;
    const trigger = this.host.nativeElement.querySelector('.date-trigger') as HTMLElement | null;
    const panel = this.host.nativeElement.querySelector('.date-panel') as HTMLElement | null;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(PANEL_W, vw - 16);
    const h = panel?.offsetHeight || 380;

    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, r.right - w);
    if (left < 8) left = 8;

    const below = vh - r.bottom - GAP;
    const above = r.top - GAP;
    let top = below >= h || below >= above ? r.bottom + GAP : r.top - GAP - h;
    top = Math.max(8, Math.min(top, vh - h - 8));

    this.panelPos.set({ top, left, ready: !!panel });
  }

  @HostListener('window:resize')
  onResize(): void { this.positionPanel(); }

  /** Capture-phase listener: follows the field when a modal body (not the window) scrolls. */
  private readonly onAnyScroll = () => this.positionPanel();

  writeValue(v: string | null): void {
    const raw = v ?? '';
    this.value.set(raw);
    if (!this.editing) this.text.set(this.formatIso(raw));
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
      this.panelPos.set({ top: 0, left: 0, ready: false });
      document.addEventListener('scroll', this.onAnyScroll, true);
      // Two frames: first renders the panel (hidden), second measures its real height.
      requestAnimationFrame(() => { this.positionPanel(); requestAnimationFrame(() => this.positionPanel()); });
    } else {
      this.releaseActive();
    }
    this.open.set(next);
    this.onTouched();
  }

  private releaseActive(): void {
    document.removeEventListener('scroll', this.onAnyScroll, true);
    if (DateInputComponent.active === this) DateInputComponent.active = null;
  }

  private static closeOthers(except: DateInputComponent): void {
    const other = DateInputComponent.active;
    if (other && other !== except) {
      other.open.set(false);
      other.releaseActive();
    }
  }

  private closePanel(): void {
    this.open.set(false);
    this.releaseActive();
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
    this.editing = false;
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
    this.text.set('');
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
    if (!this.editing) this.text.set(this.formatIso(next));
    const parsed = parseIsoDate(dateIso);
    if (parsed) {
      this.viewYear.set(parsed.y);
      this.viewMonth.set(parsed.m);
    }
  }
}
