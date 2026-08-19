import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/** Keeps text inputs numeric-only (integer digits). */
@Directive({
  selector: 'input[digitsOnly]',
  standalone: true,
  host: { type: 'tel', inputmode: 'numeric', autocomplete: 'off' },
})
export class DigitsOnlyDirective {
  private el = inject(ElementRef<HTMLInputElement>);

  @HostListener('input')
  onInput(): void {
    const el = this.el.nativeElement;
    const clean = el.value.replace(/\D/g, '');
    if (clean !== el.value) {
      el.value = clean;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(e: InputEvent): void {
    if (e.inputType.startsWith('delete') || e.inputType === 'insertFromPaste') return;
    const data = e.data;
    if (!data || [...data].every((ch) => /\d/.test(ch))) return;
    e.preventDefault();
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (!digits) return;
    const el = this.el.nativeElement;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + digits + el.value.slice(end);
    el.setSelectionRange(start + digits.length, start + digits.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
  }
}
