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
  templateUrl: './ma-tasks.component.html',
  styleUrl: './ma-tasks.component.scss',
  standalone: true,
  imports: [IconComponent, EmptyComponent, LoadingComponent, TPipe, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
