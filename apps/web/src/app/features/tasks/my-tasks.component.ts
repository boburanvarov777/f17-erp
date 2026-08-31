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
import { DateInputComponent } from '../../shared/ui/date-input.component';
import { ProgressComponent } from '../../shared/ui/progress.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

@Component({
  selector: 'app-my-tasks',
  templateUrl: './my-tasks.component.html',
  styleUrl: './my-tasks.component.scss',
  standalone: true,
  imports: [FormsModule, IconComponent, ProgressComponent, EmptyComponent, LoadingComponent, ModalComponent, DateInputComponent, StatusBadgeComponent, TPipe, NumPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTasksComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
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
  readonly fe = new FieldErrorsState();
  form: Record<string, any> = {};

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.tasks() : this.tasks().filter((t) => t.status === f);
  });

  constructor() { this.load(); }

  plan(key: string): PlanView | undefined { return this.plans()[key]; }

  lineQty(m: { qty: number; targetQty?: number }): string {
    return m.targetQty ? `${m.qty} / ${m.targetQty}` : `${m.qty}`;
  }

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
    this.fe.reset();
    this.form = {
      title: t.title ?? '', description: t.description ?? '',
      date: (t.date ?? '').slice(0, 10) || '',
      status: t.status ?? '',
      startedAt: t.startedAt ? t.startedAt.slice(0, 16) : '',
      finishedAt: t.finishedAt ? t.finishedAt.slice(0, 16) : '',
      note: t.note ?? '',
    };
    this.editing.set(t);
  }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'title', label: t('task_title'), value: this.form['title'], required: true },
      { key: 'date', label: t('date'), value: this.form['date'], required: true },
      { key: 'status', label: t('status'), value: this.form['status'], required: true },
    ], t))) return;

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
