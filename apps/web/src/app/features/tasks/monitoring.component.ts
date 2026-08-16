import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { InitialsPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { ProgressComponent } from '../../shared/ui/progress.component';

interface Row {
  id: string; firstName: string; lastName: string; position?: string; avatar?: string;
  department?: { nameUz: string; code: string } | null;
  today: { total: number; done: number };
  week: { total: number; done: number };
  month: { total: number; done: number };
  overdue: number; progress: number;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [FormsModule, ProgressComponent, EmptyComponent, LoadingComponent, TPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'monitoring_title' | t }}</div>
          <div class="sub">{{ rows().length }} ta xodim</div>
        </div>
        <select class="select btn-sm" style="width:auto;height:32px" [(ngModel)]="departmentId" (ngModelChange)="load()">
          <option value="">{{ 'department' | t }}: {{ 'all' | t }}</option>
          @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.nameUz }}</option> }
        </select>
      </div>

      <div class="card">
        @if (loading()) { <ui-loading /> }
        @else if (rows().length) {
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                <th>{{ 'full_name' | t }}</th><th>{{ 'department' | t }}</th>
                <th>{{ 'today' | t }}</th><th>{{ 'this_week' | t }}</th><th>{{ 'this_month' | t }}</th>
                <th style="width:170px">{{ 'progress' | t }}</th><th class="num">{{ 'overdue' | t }}</th>
              </tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    <td>
                      <div class="row gap-3">
                        <span class="avatar sm">{{ r.firstName | initials: r.lastName }}</span>
                        <span>
                          <span class="small bold" style="display:block">{{ r.lastName }} {{ r.firstName }}</span>
                          <span class="tiny text-3">{{ r.position || '—' }}</span>
                        </span>
                      </div>
                    </td>
                    <td class="small">{{ r.department?.nameUz || '—' }}</td>
                    <td class="mono small">{{ r.today.done }} / {{ r.today.total }}</td>
                    <td class="mono small">{{ r.week.done }} / {{ r.week.total }}</td>
                    <td class="mono small">{{ r.month.done }} / {{ r.month.total }}</td>
                    <td><ui-progress [value]="r.progress" [max]="100" /></td>
                    <td class="num" [style.color]="r.overdue ? 'var(--danger)' : ''">{{ r.overdue || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <ui-empty icon="users" [title]="'no_data' | t" /> }
      </div>
    </div>
  `,
})
export class MonitoringComponent {
  private api = inject(ApiService);
  readonly rows = signal<Row[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  departmentId = '';

  constructor() {
    this.load();
    this.api.get<Department[]>('/departments').subscribe({ next: (d) => this.departments.set(d), error: () => void 0 });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<Row[]>('/users/monitoring', { departmentId: this.departmentId }).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
