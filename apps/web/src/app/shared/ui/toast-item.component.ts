import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import type { Toast } from '../../core/services/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-toast-item',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast" [class]="t().type" (mouseenter)="pause()" (mouseleave)="resume()">
      <div class="toast-body">
        <span [style.color]="iconColor()">
          <ui-icon [name]="iconName()" [size]="17" />
        </span>
        <div class="grow">
          <div class="toast-title">{{ t().title }}</div>
          @if (t().body) { <div class="small text-3">{{ t().body }}</div> }
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="closed.emit(t().id)">
          <ui-icon name="x" [size]="14" />
        </button>
      </div>
      <div class="toast-track" aria-hidden="true">
        <div class="toast-bar" #bar></div>
      </div>
    </div>
  `,
})
export class ToastItemComponent implements AfterViewInit, OnDestroy {
  readonly t = input.required<Toast>();
  readonly closed = output<number>();

  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private timer?: ReturnType<typeof setTimeout>;
  private endAt = 0;
  private paused = false;

  ngAfterViewInit(): void {
    this.run(this.t().ttl);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  iconName(): string {
    const type = this.t().type;
    return type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
  }

  iconColor(): string {
    const type = this.t().type;
    return type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--info)';
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);

    const el = this.bar().nativeElement;
    const scale = readScaleX(el);
    el.style.transition = 'none';
    el.style.transform = `scaleX(${scale})`;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;

    const remaining = this.endAt - Date.now();
    if (remaining <= 0) {
      this.closed.emit(this.t().id);
      return;
    }

    const el = this.bar().nativeElement;
    void el.offsetWidth;
    el.style.transition = `transform ${remaining}ms linear`;
    el.style.transform = 'scaleX(0)';
    this.timer = setTimeout(() => this.closed.emit(this.t().id), remaining);
  }

  private run(ms: number): void {
    const el = this.bar().nativeElement;
    el.style.transition = 'none';
    el.style.transform = 'scaleX(1)';
    void el.offsetWidth;
    el.style.transition = `transform ${ms}ms linear`;
    el.style.transform = 'scaleX(0)';
    this.endAt = Date.now() + ms;
    this.timer = setTimeout(() => this.closed.emit(this.t().id), ms);
  }
}

function readScaleX(el: HTMLElement): number {
  const raw = getComputedStyle(el).transform;
  if (!raw || raw === 'none') return 1;
  return new DOMMatrix(raw).a;
}
