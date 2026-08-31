import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OrderStage, Paginated } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { GroupedNumberDirective } from '../../shared/directives/grouped-number.directive';
import { FieldErrorsState, isMissingQty, runValidation } from '../../shared/utils/form-validate';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

/** The employee reports what they produced — the same transactional path the web uses. */
@Component({
  selector: 'app-ma-report',
  templateUrl: './ma-report.component.html',
  styleUrl: './ma-report.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, EmptyComponent, LoadingComponent, TPipe, GroupedNumberDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaReportComponent {
  private api = inject(ApiService);
  readonly i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly fe = new FieldErrorsState();

  readonly quick = [10, 25, 50, 100, 250];
  readonly items = signal<OrderStage[]>([]);
  readonly selected = signal<OrderStage | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly ok = signal(false);

  qty: number | null = null;
  defectQty: number | null = null;
  note = '';

  readonly stageType = computed(() => this.ma.user()?.department?.stage ?? null);
  readonly stageSlug = computed(() => this.stageType()?.toLowerCase() ?? '');
  readonly isPacking = computed(() => this.stageType() === 'PACKING');

  constructor() {
    this.load();
    effect(() => {
      if (this.ma.productionTick() > 0) this.load();
    });
  }

  load(): void {
    const slug = this.stageSlug();
    if (!slug) { this.loading.set(false); return; }
    this.loading.set(true);
    this.api.get<Paginated<OrderStage>>(`/production/${slug}`, { limit: 50 }).subscribe({
      next: (d) => { this.items.set(d.items.filter((s) => s.status !== 'COMPLETED')); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  select(s: OrderStage): void {
    this.fe.reset();
    this.selected.set(s);
    this.qty = null;
    this.defectQty = null;
    this.note = '';
    this.error.set('');
    this.ok.set(false);
  }

  submit(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    const s = this.selected();
    if (!s) return;
    if (!this.fe.apply(runValidation([
      { key: 'qty', label: t('ma_enter_qty'), value: this.qty, custom: (v) => isMissingQty(v) ? t('ma_enter_qty') : null },
    ], t))) {
      haptic('error');
      return;
    }

    this.busy.set(true);
    this.error.set('');

    this.api
      .post(`/production/${this.stageSlug()}/entries`, {
        orderId: s.order?.id ?? s.orderId,
        qty: +this.qty!,
        defectQty: +(this.defectQty || 0),
        date: new Date().toISOString(),
        note: this.isPacking() ? (this.note || this.i18n.t('ma_source_miniapp')) : this.i18n.t('ma_source_miniapp'),
        source: 'MINIAPP',
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.ok.set(true);
          haptic('success');
          this.ma.notifyProduction();
          setTimeout(() => { this.selected.set(null); this.load(); }, 1100);
        },
        error: (e) => {
          this.busy.set(false);
          haptic('error');
          const m = e?.error?.message;
          this.error.set(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
        },
      });
  }
}
