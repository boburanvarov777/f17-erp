import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PlanView, Task, TaskStatus } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { NumPipe, ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { ProgressComponent } from '../../shared/ui/progress.component';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'tasks_title' | t }}</div>
          <div class="sub">{{ auth.user()?.fullName }} · {{ auth.user()?.department?.name || auth.user()?.position }}</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" (click)="open({})"><ui-icon name="plus" [size]="15" /> {{ 'new_task' | t }}</button>
      </div>

      <div class="grid three mb-6">
        @for (p of periods; track p.key) {
          <div class="card card-pad">
            <div class="row-between mb-3">
              <b style="font-size:13.5px">{{ p.label | t }}</b>
              <span class="badge badge-neutral">{{ plan(p.key)?.done || 0 }} / {{ plan(p.key)?.total || 0 }}</span>
            </div>
            <ui-progress [value]="plan(p.key)?.done || 0" [max]="plan(p.key)?.total || 1" [showLabel]="false" />
            <div class="row-between mt-3 small text-3">
              <span>{{ 'produced' | t }}: <b class="text-2">{{ plan(p.key)?.producedQty || 0 | num }}</b></span>
              @if ((plan(p.key)?.overdue || 0) > 0) {
                <span style="color:var(--danger)">{{ 'overdue' | t }}: {{ plan(p.key)?.overdue }}</span>
              }
            </div>
          </div>
        }
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="tabs" style="border:none">
            @for (f of filters; track f.key) {
              <button type="button" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label | t }}</button>
            }
          </div>
        </div>

        @if (loading()) { <ui-loading /> }
        @else if (visible().length) {
          <div class="tlist">
            @for (t of visible(); track t.id) {
              <div class="titem" [class.done]="t.status === 'DONE'">
                <button class="tcheck" type="button" (click)="toggle(t)" [class.on]="t.status === 'DONE'">
                  @if (t.status === 'DONE') { <ui-icon name="check" [size]="13" /> }
                </button>
                <div class="grow" style="min-width:0">
                  <div class="row gap-2 wrap">
                    <b class="small">{{ t.title }}</b>
                    @if (t.order) { <span class="badge badge-neutral mono">{{ t.order.number }}</span> }
                    @if (t.stage) { <span class="badge badge-info">{{ 'stage_' + t.stage | t }}</span> }
                  </div>
                  @if (t.description) { <div class="tiny text-3">{{ t.description }}</div> }
                  <div class="tiny text-3">{{ t.date | shortDate }}@if (t.finishedAt) { · {{ 'finished_at' | t }}: {{ t.finishedAt | shortDate: true }} }</div>
                </div>
                <select class="select btn-sm" style="width:auto;height:30px" [ngModel]="t.status" (ngModelChange)="setStatus(t, $event)">
                  @for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }
                </select>
                <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="open(t)"><ui-icon name="pencil" [size]="14" /></button>
              </div>
            }
          </div>
        } @else { <ui-empty icon="list-checks" [title]="'no_data' | t" /> }
      </div>
    </div>

    @if (editing(); as t) {
      <ui-modal [title]="t.id ? ('edit' | t) : ('new_task' | t)" (closed)="editing.set(null)">
        <div class="form-grid">
          <div class="field full"><label class="label">{{ 'task_title' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="form.title" /></div>
          <div class="field full"><label class="label">{{ 'description' | t }}</label><textarea class="textarea" rows="2" [(ngModel)]="form.description"></textarea></div>
          <div class="field"><label class="label">{{ 'date' | t }} <span class="req">*</span></label><input class="input" type="date" [(ngModel)]="form.date" /></div>
          <div class="field">
            <label class="label">{{ 'status' | t }}</label>
            <select class="select" [(ngModel)]="form.status">@for (s of statuses; track s) { <option [value]="s">{{ 'st_' + s | t }}</option> }</select>
          </div>
          <div class="field"><label class="label">{{ 'started_at' | t }}</label><input class="input" type="datetime-local" [(ngModel)]="form.startedAt" /></div>
          <div class="field"><label class="label">{{ 'finished_at' | t }}</label><input class="input" type="datetime-local" [(ngModel)]="form.finishedAt" /></div>
          <div class="field full"><label class="label">{{ 'note' | t }}</label><input class="input" [(ngModel)]="form.note" /></div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !form.title || !form.date">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
  styles: [`
    .grid.three { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .tlist { display: flex; flex-direction: column; }
    .titem { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .titem:last-child { border-bottom: none; }
    .titem.done { opacity: .6; }
    .titem.done b { text-decoration: line-through; }
    .tcheck { width: 21px; height: 21px; border-radius: 6px; border: 1.5px solid var(--border-strong); background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; color: #fff; }
    .tcheck.on { background: var(--success); border-color: var(--success); }
  `],
})
export class MyTasksComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly statuses = STATUSES;
  readonly periods = [
    { key: 'DAILY', label: 'daily_plan' },
    { key: 'WEEKLY', label: 'weekly_plan' },
    { key: 'MONTHLY', label: 'monthly_plan' },
  ];
  readonly filters = [
    { key: 'all', label: 'all' },
    { key: 'TODO', label: 'st_TODO' },
    { key: 'IN_PROGRESS', label: 'st_IN_PROGRESS' },
    { key: 'DONE', label: 'st_DONE' },
  ];

  readonly tasks = signal<Task[]>([]);
  readonly plans = signal<Record<string, PlanView>>({});
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly filter = signal('all');
  readonly editing = signal<Partial<Task> | null>(null);
  form: Record<string, any> = {};

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.tasks() : this.tasks().filter((t) => t.status === f);
  });

  constructor() { this.load(); }

  plan(key: string): PlanView | undefined { return this.plans()[key]; }

  load(): void {
    this.loading.set(true);
    const from = new Date(); from.setDate(from.getDate() - 30);
    this.api.get<{ items: Task[] }>('/tasks/my', { limit: 100, from: from.toISOString() }).subscribe({
      next: (r) => { this.tasks.set(r.items); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    for (const p of this.periods) {
      this.api.get<PlanView>(`/plans/${p.key}`).subscribe({
        next: (v) => this.plans.update((m) => ({ ...m, [p.key]: v })),
        error: () => void 0,
      });
    }
  }

  toggle(t: Task): void { this.setStatus(t, t.status === 'DONE' ? 'TODO' : 'DONE'); }

  setStatus(t: Task, status: TaskStatus): void {
    this.api.patch(`/tasks/${t.id}`, { status }).subscribe({ next: () => this.load(), error: () => void 0 });
  }

  open(t: Partial<Task>): void {
    this.form = {
      title: t.title ?? '', description: t.description ?? '',
      date: (t.date ?? new Date().toISOString()).slice(0, 10),
      status: t.status ?? 'TODO',
      startedAt: t.startedAt ? t.startedAt.slice(0, 16) : '',
      finishedAt: t.finishedAt ? t.finishedAt.slice(0, 16) : '',
      note: t.note ?? '',
    };
    this.editing.set(t);
  }

  save(): void {
    this.busy.set(true);
    const body: Record<string, unknown> = {
      title: this.form['title'], description: this.form['description'] || undefined,
      date: new Date(this.form['date']).toISOString(), status: this.form['status'],
      startedAt: this.form['startedAt'] ? new Date(this.form['startedAt']).toISOString() : undefined,
      finishedAt: this.form['finishedAt'] ? new Date(this.form['finishedAt']).toISOString() : undefined,
      note: this.form['note'] || undefined,
    };
    const id = this.editing()?.id;
    const req = id ? this.api.patch(`/tasks/${id}`, body) : this.api.post('/tasks', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.load(); },
      error: () => this.busy.set(false),
    });
  }
}
