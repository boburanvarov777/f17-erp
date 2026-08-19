import { Directive, ElementRef, HostListener, Input, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Formats integer (or decimal) quantities as 10 000 while keeping a numeric model. */
@Directive({
  selector: 'input[groupedNumber]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GroupedNumberDirective), multi: true }],
  host: {
    type: 'tel',
    '[attr.inputmode]': 'decimals > 0 ? "decimal" : "numeric"',
    autocomplete: 'off',
  },
})
export class GroupedNumberDirective implements ControlValueAccessor {
  private el = inject(ElementRef<HTMLInputElement>);

  /** Fractional digits allowed. 0 = integers only (quantities, piece counts). */
  @Input() decimals = 0;

  private onChange: (v: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private disabled = false;

  writeValue(value: number | string | null | undefined): void {
    const n = typeof value === 'string' ? this.parse(value) : value;
    this.el.nativeElement.value = n == null || !Number.isFinite(n) ? '' : this.format(n);
  }

  registerOnChange(fn: (v: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.el.nativeElement.disabled = isDisabled;
  }

  @HostListener('input')
  onInput(): void {
    if (this.disabled) return;
    const el = this.el.nativeElement;
    const caretDigits = this.digitCount(el.value.slice(0, el.selectionStart ?? 0));
    const n = this.parse(el.value);
    const formatted = n == null ? this.keepPartial(el.value) : this.format(n);
    el.value = formatted;
    this.onChange(n);
    this.setCaret(el, caretDigits);
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
    const n = this.parse(this.el.nativeElement.value);
    this.el.nativeElement.value = n == null ? '' : this.format(n);
    this.onChange(n);
  }

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(e: InputEvent): void {
    if (this.disabled || e.inputType.startsWith('delete') || e.inputType === 'insertFromPaste') return;
    const data = e.data;
    if (!data) return;
    if ([...data].every((ch) => this.allowedChar(ch, this.el.nativeElement.value))) return;
    e.preventDefault();
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    if (this.disabled) return;
    e.preventDefault();
    const raw = e.clipboardData?.getData('text') ?? '';
    const filtered = [...raw].filter((ch) => this.allowedChar(ch, this.el.nativeElement.value)).join('');
    if (!filtered) return;
    this.insertText(filtered);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    if (this.allowedChar(e.key, this.el.nativeElement.value)) return;
    e.preventDefault();
  }

  private allowedChar(ch: string, current: string): boolean {
    if (/\d/.test(ch)) return true;
    return this.decimals > 0 && (ch === '.' || ch === ',') && !/[.,]/.test(current);
  }

  private insertText(text: string): void {
    const el = this.el.nativeElement;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private parse(raw: string): number | null {
    const compact = raw.replace(/\s/g, '').replace(',', '.');
    if (!compact || compact === '.' || compact === '-') return null;
    const n = this.decimals > 0 ? parseFloat(compact) : parseInt(compact.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  private format(n: number): string {
    if (this.decimals <= 0) {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    const [int, frac] = n.toString().split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return frac != null ? `${grouped}.${frac.slice(0, this.decimals)}` : grouped;
  }

  /** Lets the user type a trailing decimal point before the fraction exists. */
  private keepPartial(raw: string): string {
    if (this.decimals > 0 && /[.,]\s*$/.test(raw.replace(/\s/g, ''))) {
      const n = this.parse(raw.replace(/[.,]\s*$/, ''));
      return n == null ? raw.replace(/\D/g, '') + '.' : this.format(n) + '.';
    }
    return raw.replace(/\D/g, '');
  }

  private digitCount(s: string): number { return (s.match(/\d/g) ?? []).length; }

  private setCaret(el: HTMLInputElement, digitsBefore: number): void {
    const text = el.value;
    if (!digitsBefore) { el.setSelectionRange(text.length, text.length); return; }
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
      if (/\d/.test(text[i]) && ++seen === digitsBefore) {
        el.setSelectionRange(i + 1, i + 1);
        return;
      }
    }
    el.setSelectionRange(text.length, text.length);
  }
}
