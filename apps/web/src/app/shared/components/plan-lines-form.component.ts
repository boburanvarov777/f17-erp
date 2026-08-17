import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PlanView } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { DigitsOnlyDirective } from '../directives/digits-only.directive';
import { NumPipe } from '../pipes/format.pipe';
import { TPipe } from '../pipes/t.pipe';
import { LoadingComponent } from '../ui/empty.component';

interface LineDraft {
  orderId: string;
  orderNumber: string;
  modelCode: string;
  targetQty: number;
  _active?: boolean;
}

interface StageCandidate {
  orderId: string;
  order: { id: string; number: string; model?: { code: string } | null };
}

@Component({
  selector: 'app-plan-lines-form',
  standalone: true,
  imports: [FormsModule, TPipe, NumPipe, DigitsOnlyDirective, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <ui-loading [count]="3" [height]="44" />
    } @else {
      <div class="tiny text-3 mb-3">{{ 'plan_lines_hint' | t }}</div>
      @if (rows().length) {
        <div class="col gap-2">
          @for (r of rows(); track r.orderId) {
            <label class="plan-line-row" [class.on]="r.targetQty > 0">
              <input type="checkbox" [checked]="r.targetQty > 0" (change)="toggle(r, $event)" />
              <span class="grow">
                <span class="mono small bold">{{ r.orderNumber }}</span>
                <span class="tiny text-3"> · {{ r.modelCode }}</span>
              </span>
              <input
                class="input qty-in"
                type="tel"
                inputmode="numeric"
                digitsOnly
                [(ngModel)]="r.targetQty"
                (ngModelChange)="onQtyChange(r)"
              />
            </label>
          }
        </div>
        <div class="row-between mt-4 small">
          <span class="text-3">{{ 'plan_total' | t }}</span>
          <b class="mono">{{ total() | num }} {{ 'pieces' | t }}</b>
        </div>
      } @else {
        <div class="tiny text-3">{{ 'plan_no_orders' | t }}</div>
      }
      @if (error()) { <div class="err-text mt-3">{{ error() }}</div> }
    }
  `,
  styles: [`
    .plan-line-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r);
      background: var(--surface); cursor: pointer;
    }
    .plan-line-row.on { border-color: var(--primary-500); background: var(--primary-50); }
    .plan-line-row input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--primary); flex-shrink: 0; }
    .qty-in { width: 88px; height: 34px; text-align: center; padding: 0 8px; }
  `],
})
export class PlanLinesFormComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  readonly userId = input.required<string>();
  readonly saved = output<void>();
  readonly busy = output<boolean>();

  readonly rows = signal<LineDraft[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const id = this.userId();
      if (id) this.load(id);
    });
  }

  total(): number {
    return this.rows().filter((r) => r.targetQty > 0).reduce((a, r) => a + (+r.targetQty || 0), 0);
  }

  toggle(r: LineDraft, ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    r._active = on;
    if (!on) r.targetQty = 0;
    else if (!r.targetQty) r.targetQty = 50;
    this.rows.update((list) => [...list]);
  }

  onQtyChange(r: LineDraft): void {
    r._active = (+r.targetQty || 0) > 0;
    this.rows.update((list) => [...list]);
  }

  load(userId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<PlanView>('/plans/DAILY', { userId }).subscribe({
      next: (plan) => {
        this.api.get<StageCandidate[]>('/plans/DAILY/candidates', { userId }).subscribe({
          next: (candidates) => { this.merge(plan, candidates); this.loading.set(false); },
          error: () => { this.merge(plan, []); this.loading.set(false); },
        });
      },
      error: () => {
        this.api.get<StageCandidate[]>('/plans/DAILY/candidates', { userId }).subscribe({
          next: (candidates) => { this.merge(null, candidates); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      },
    });
  }

  private merge(plan: PlanView | null, candidates: StageCandidate[]): void {
    const existing = new Map<string, number>();
    for (const l of plan?.lines ?? []) {
      if (l.targetQty) existing.set(l.orderId, l.targetQty);
    }
    const map = new Map<string, LineDraft>();
    for (const c of candidates) {
      map.set(c.orderId, {
        orderId: c.orderId,
        orderNumber: c.order?.number ?? '—',
        modelCode: c.order?.model?.code ?? '—',
        targetQty: existing.get(c.orderId) ?? 0,
      });
    }
    for (const l of plan?.lines ?? []) {
      if (!map.has(l.orderId)) {
        map.set(l.orderId, {
          orderId: l.orderId,
          orderNumber: l.orderNumber,
          modelCode: l.modelCode,
          targetQty: l.targetQty ?? 0,
        });
      }
    }
    this.rows.set([...map.values()]);
  }

  submit(): void {
    const lines = this.rows()
      .filter((r) => (+r.targetQty || 0) > 0)
      .map((r) => ({ orderId: r.orderId, targetQty: +r.targetQty }));
    if (!lines.length) {
      this.error.set(this.i18n.t('plan_pick_order'));
      return;
    }
    this.busy.emit(true);
    this.error.set('');
    this.api.post<PlanView>('/plans/DAILY', { userId: this.userId(), targetQty: this.total(), lines }).subscribe({
      next: () => {
        this.busy.emit(false);
        this.toast.success(this.i18n.t('saved'));
        this.saved.emit();
      },
      error: (e) => {
        this.busy.emit(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }
}
