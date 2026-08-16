import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { Task, TaskStatus } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ShortDatePipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { haptic } from './telegram';

@Component({
  selector: 'app-ma-tasks',
  standalone: true,
  imports: [IconComponent, EmptyComponent, LoadingComponent, TPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="mb-3" style="font-size:17px">{{ 'ma_my_work' | t }}</h2>

    @if (loading()) { <ui-loading [count]="5" [height]="60" /> }
    @else if (tasks().length) {
      <div class="col gap-2">
        @for (t of tasks(); track t.id) {
          <div class="titem" [class.done]="t.status === 'DONE'">
            <button class="tcheck" type="button" [class.on]="t.status === 'DONE'" (click)="toggle(t)">
              @if (t.status === 'DONE') { <ui-icon name="check" [size]="13" /> }
            </button>
            <div class="grow" style="min-width:0">
              <div class="small bold truncate">{{ t.title }}</div>
              <div class="tiny text-3">
                {{ t.date | shortDate }}@if (t.order) { · {{ t.order.number }} }
              </div>
            </div>
            <span class="badge" [class]="tone(t.status)">{{ 'st_' + t.status | t }}</span>
          </div>
        }
      </div>
    } @else { <ui-empty icon="list-checks" [title]="'ma_no_tasks' | t" /> }
  `,
  styles: [`
    .titem { display: flex; align-items: center; gap: 11px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); }
    .titem.done { opacity: .6; }
    .titem.done .bold { text-decoration: line-through; }
    .tcheck { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid var(--border-strong); background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; color: #fff; }
    .tcheck.on { background: var(--success); border-color: var(--success); }
  `],
})
export class MaTasksComponent {
  private api = inject(ApiService);
  readonly tasks = signal<Task[]>([]);
  readonly loading = signal(true);

  constructor() { this.load(); }

  load(): void {
    const from = new Date();
    from.setDate(from.getDate() - 14);
    this.api.get<{ items: Task[] }>('/tasks/my', { limit: 60, from: from.toISOString() }).subscribe({
      next: (r) => { this.tasks.set(r.items); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  toggle(t: Task): void {
    haptic('success');
    this.api.patch(`/tasks/${t.id}`, { status: t.status === 'DONE' ? 'TODO' : 'DONE' }).subscribe({
      next: () => this.load(), error: () => void 0,
    });
  }

  tone(s: TaskStatus): string {
    return { TODO: 'badge-neutral', IN_PROGRESS: 'badge-warning', DONE: 'badge-success', BLOCKED: 'badge-danger' }[s];
  }
}
