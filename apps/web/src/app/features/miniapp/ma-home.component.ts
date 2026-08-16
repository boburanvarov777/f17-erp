import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PlanView } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { MiniAppService } from './miniapp.service';
import { haptic } from './telegram';

@Component({
  selector: 'app-ma-home',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, LoadingComponent, ModalComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ma.user(); as u) {
      <div class="hero">
        <div class="row-between">
          <div>
            <div class="tiny" style="opacity:.75">{{ greeting() }}</div>
            <div style="font-size:17px;font-weight:600">{{ u.fullName }}</div>
            <div class="tiny" style="opacity:.75">{{ u.department?.name || u.position }}</div>
          </div>
          <div class="hero-ic"><ui-icon [name]="stageIcon()" [size]="22" /></div>
        </div>
      </div>

      @if (loading()) { <ui-loading [count]="3" [height]="70" /> }
      @else {
        <div class="col gap-3 mt-4">
          @for (p of periods; track p.key) {
            <div
              class="card card-pad"
              [class.clickable]="p.key === 'DAILY'"
              (click)="p.key === 'DAILY' && openDailyPlan()"
            >
              <div class="row-between mb-3">
                <b class="small">{{ p.label | t }}</b>
                @if (p.key === 'DAILY') {
                  <span class="badge badge-neutral">{{ plans()[p.key]?.producedQty || 0 | num }} / {{ plans()[p.key]?.targetQty || 0 | num }}</span>
                } @else {
                  <span class="badge badge-neutral">{{ plans()[p.key]?.done || 0 }} / {{ plans()[p.key]?.total || 0 }}</span>
                }
              </div>
              @if (p.key === 'DAILY') {
                <ui-progress [value]="plans()[p.key]?.producedQty || 0" [max]="plans()[p.key]?.targetQty || 1" [showLabel]="false" />
              } @else {
                <ui-progress [value]="plans()[p.key]?.done || 0" [max]="plans()[p.key]?.total || 1" [showLabel]="false" />
              }
              <div class="row-between mt-3 tiny text-3">
                <span>{{ 'produced' | t }}: <b class="text-2">{{ plans()[p.key]?.producedQty || 0 | num }}</b> {{ 'pieces' | t }}</span>
                @if (p.key === 'DAILY') {
                  <span class="edit-hint"><ui-icon name="pencil" [size]="12" /> {{ 'tap_to_edit_plan' | t }}</span>
                } @else if ((plans()[p.key]?.overdue || 0) > 0) {
                  <span style="color:var(--danger)">{{ 'overdue' | t }}: {{ plans()[p.key]?.overdue }}</span>
                }
              </div>
            </div>
          }
        </div>
      }
    }

    @if (planModal()) {
      <ui-modal [title]="'edit_daily_plan' | t" (closed)="planModal.set(false)">
        <div class="field">
          <label class="label">{{ 'plan_target_qty' | t }}</label>
          <input class="input" type="number" min="0" [(ngModel)]="planTarget" />
          <div class="tiny text-3 mt-2">{{ 'plan_target_hint' | t }}</div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="planModal.set(false)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="saveDailyPlan()" [disabled]="planBusy()">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .hero { background: linear-gradient(135deg, #1b3a6b, #101828); color: #fff; border-radius: var(--r-xl); padding: 18px; }
    .hero-ic { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.13); display: flex; align-items: center; justify-content: center; }
    .clickable { cursor: pointer; transition: box-shadow .15s; }
    .clickable:active { box-shadow: var(--sh-2); }
    .edit-hint { display: inline-flex; align-items: center; gap: 4px; color: var(--primary-500); }
  `],
})
export class MaHomeComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly ma = inject(MiniAppService);

  readonly periods = [
    { key: 'DAILY', label: 'daily_plan' },
    { key: 'WEEKLY', label: 'weekly_plan' },
    { key: 'MONTHLY', label: 'monthly_plan' },
  ];
  readonly plans = signal<Record<string, PlanView>>({});
  readonly loading = signal(true);
  readonly planModal = signal(false);
  readonly planBusy = signal(false);
  planTarget = 0;

  constructor() {
    this.reloadPlans();
  }

  reloadPlans(): void {
    this.loading.set(true);
    let pending = this.periods.length;
    for (const p of this.periods) {
      this.api.get<PlanView>(`/plans/${p.key}`).subscribe({
        next: (v) => {
          this.plans.update((m) => ({ ...m, [p.key]: v }));
          if (--pending === 0) this.loading.set(false);
        },
        error: () => { if (--pending === 0) this.loading.set(false); },
      });
    }
  }

  openDailyPlan(): void {
    this.planTarget = this.plans()['DAILY']?.targetQty ?? 0;
    this.planModal.set(true);
    haptic('success');
  }

  saveDailyPlan(): void {
    this.planBusy.set(true);
    this.api.post('/plans/DAILY/my', { targetQty: this.planTarget }).subscribe({
      next: () => {
        this.planBusy.set(false);
        this.planModal.set(false);
        this.toast.success(this.i18n.t('saved'));
        haptic('success');
        this.reloadPlans();
      },
      error: (e) => {
        this.planBusy.set(false);
        haptic('error');
        const m = e?.error?.message;
        this.toast.error(Array.isArray(m) ? m.join(', ') : m || this.i18n.t('error'));
      },
    });
  }

  greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech';
  }

  stageIcon(): string {
    const s = this.ma.user()?.department?.stage;
    return ({ CUTTING: 'scissors', SEWING: 'needle', WASHING: 'droplets', LASER: 'zap', PACKING: 'package', LOADING: 'truck' } as Record<string, string>)[s ?? ''] ?? 'user';
  }
}
