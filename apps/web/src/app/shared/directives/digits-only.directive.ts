import { Directive, HostListener } from '@angular/core';

/** Keeps text inputs numeric-only (integer digits). */
@Directive({ selector: 'input[digitsOnly]', standalone: true })
export class DigitsOnlyDirective {
  @HostListener('input', ['$event'])
  onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const clean = el.value.replace(/\D/g, '');
    if (clean !== el.value) {
      el.value = clean;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
  }
}
