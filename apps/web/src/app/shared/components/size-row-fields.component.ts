import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mergeSizeOptions, SIZE_CUSTOM, isKnownSize, isNumericSize } from '../constants/clothing-sizes';
import { DigitsOnlyDirective } from '../directives/digits-only.directive';
import { GroupedNumberDirective } from '../directives/grouped-number.directive';
import { TPipe } from '../pipes/t.pipe';

export interface SizeRowValue { size: string; qty: number | null; }

@Component({
  selector: 'app-size-row-fields',
  standalone: true,
  imports: [FormsModule, TPipe, DigitsOnlyDirective, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="size-row-fields">
      <div class="field size-field">
        <label class="label">{{ 'size_label' | t }}</label>
        @if (custom()) {
          <div class="row gap-1">
            <input
              class="input btn-sm size-in mono"
              digitsOnly
              [(ngModel)]="row().size"
              (ngModelChange)="onSizeInput()"
              [placeholder]="'size_placeholder' | t"
            />
            <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="useList()" [attr.data-tip]="'size_from_list' | t">↩</button>
          </div>
        } @else {
          <select class="select btn-sm size-in" [ngModel]="selectValue()" (ngModelChange)="onSelect($event)">
            <option value="" disabled>{{ 'select_size' | t }}</option>
            <optgroup [label]="'size_letters' | t">
              @for (sz of options().letters; track sz) { <option [value]="sz">{{ sz }}</option> }
            </optgroup>
            <optgroup [label]="'size_numbers' | t">
              @for (sz of options().numbers; track sz) { <option [value]="sz">{{ sz }}</option> }
            </optgroup>
            @if (options().extra.length) {
              <optgroup [label]="'size_other' | t">
                @for (sz of options().extra; track sz) { <option [value]="sz">{{ sz }}</option> }
              </optgroup>
            }
            <option [value]="customKey">{{ 'size_custom_number' | t }}</option>
          </select>
        }
      </div>

      <div class="field qty-field">
        <label class="label">{{ 'quantity' | t }}</label>
        <input
          class="input btn-sm qty-in"
          groupedNumber
          [(ngModel)]="row().qty"
          (ngModelChange)="changed.emit()"
          [placeholder]="'plan_done_placeholder' | t"
        />
      </div>

      <div class="field action-field">
        <label class="label">&nbsp;</label>
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    .size-row-fields {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .size-field { width: 112px; flex-shrink: 0; }
    .qty-field { flex: 1; min-width: 0; }
    .action-field { flex-shrink: 0; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .label { font-size: 11px; line-height: 1.2; color: var(--text-3); margin: 0; }
    .size-in, .qty-in { width: 100%; height: 32px; min-height: 32px; }
    .action-field ::ng-deep button { height: 32px; width: 32px; }
  `],
})
export class SizeRowFieldsComponent {
  readonly row = input.required<SizeRowValue>();
  readonly extraSizes = input<string[]>([]);
  readonly changed = output<void>();

  readonly customKey = SIZE_CUSTOM;
  readonly custom = signal(false);
  readonly options = signal(mergeSizeOptions());

  constructor() {
    effect(() => {
      this.options.set(mergeSizeOptions(this.extraSizes()));
      this.syncMode(this.row().size);
    });
  }

  selectValue(): string {
    const size = this.row().size.trim();
    if (!size) return '';
    if (this.custom()) return this.customKey;
    const letter = this.options().letters.find((s) => s.toUpperCase() === size.toUpperCase());
    if (letter) return letter;
    if (this.options().numbers.includes(size)) return size;
    if (this.options().extra.includes(size)) return size;
    return '';
  }

  onSelect(value: string): void {
    if (value === this.customKey) {
      this.custom.set(true);
      this.row().size = '';
      this.changed.emit();
      return;
    }
    this.custom.set(false);
    this.row().size = value;
    this.changed.emit();
  }

  onSizeInput(): void {
    this.changed.emit();
  }

  useList(): void {
    this.custom.set(false);
    this.row().size = '';
    this.changed.emit();
  }

  private syncMode(size: string): void {
    const trimmed = size.trim();
    if (!trimmed) {
      this.custom.set(false);
      return;
    }
    if (isKnownSize(trimmed) || this.options().extra.includes(trimmed)) {
      this.custom.set(false);
      return;
    }
    this.custom.set(isNumericSize(trimmed));
  }
}
