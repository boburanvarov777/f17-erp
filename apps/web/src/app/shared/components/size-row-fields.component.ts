import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mergeSizeOptions, SIZE_CUSTOM, isKnownSize, isNumericSize } from '../constants/clothing-sizes';
import { DigitsOnlyDirective } from '../directives/digits-only.directive';
import { GroupedNumberDirective } from '../directives/grouped-number.directive';
import { TPipe } from '../pipes/t.pipe';

export interface SizeRowValue { size: string; qty: number | null; }

@Component({
  selector: 'app-size-row-fields',
  templateUrl: './size-row-fields.component.html',
  styleUrl: './size-row-fields.component.scss',
  standalone: true,
  imports: [FormsModule, TPipe, DigitsOnlyDirective, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
