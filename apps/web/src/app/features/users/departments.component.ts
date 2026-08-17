import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Department, StageType } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { ModalComponent } from '../../shared/ui/modal.component';

const STAGES: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [FormsModule, IconComponent, EmptyComponent, LoadingComponent, ModalComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'departments_title' | t }}</div>
          <div class="sub">{{ i18n.t('departments_count_sub', { n: items().length }) }}</div>
        </div>
        @if (auth.can('departments.create')) {
          <button class="btn btn-primary btn-sm" type="button" (click)="open({})" [attr.data-tip]="'new_department' | t"><ui-icon name="plus" [size]="15" /> {{ 'new_department' | t }}</button>
        }
      </div>

      <div class="card">
        @if (loading()) { <ui-loading /> }
        @else if (items().length) {
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>{{ 'code' | t }}</th><th>{{ 'dept_name_uz' | t }}</th><th>{{ 'dept_name_ru' | t }}</th><th>{{ 'dept_name_en' | t }}</th><th>{{ 'linked_stage' | t }}</th><th class="num">{{ 'employees' | t }}</th><th class="actions"></th></tr></thead>
              <tbody>
                @for (d of items(); track d.id) {
                  <tr>
                    <td class="mono small bold">{{ d.code }}</td>
                    <td>{{ d.nameUz }}</td>
                    <td class="small">{{ d.nameRu }}</td>
                    <td class="small">{{ d.nameEn }}</td>
                    <td>@if (d.stage) { <span class="badge badge-info">{{ 'stage_' + d.stage | t }}</span> } @else { <span class="text-3">—</span> }</td>
                    <td class="num">{{ d._count?.users || 0 }}</td>
                    <td class="actions">
                      @if (auth.can('departments.update')) {
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="open(d)" [attr.data-tip]="'edit' | t"><ui-icon name="pencil" [size]="15" /></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <ui-empty icon="building" [title]="'no_data' | t" /> }
      </div>
    </div>

    @if (editing(); as d) {
      <ui-modal [title]="d.id ? ('edit' | t) : ('new_department' | t)" (closed)="editing.set(null)">
        <div class="form-grid">
          <div class="field"><label class="label">{{ 'code' | t }} <span class="req">*</span></label><input class="input mono" [(ngModel)]="form.code" [disabled]="!!d.id" /></div>
          <div class="field">
            <label class="label">{{ 'linked_stage' | t }}</label>
            <select class="select" [(ngModel)]="form.stage"><option value="" disabled hidden>{{ 'select_stage' | t }}</option>@for (s of stages; track s) { <option [value]="s">{{ 'stage_' + s | t }}</option> }</select>
          </div>
          <div class="field full"><label class="label">{{ 'dept_name_uz' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="form.nameUz" /></div>
          <div class="field full"><label class="label">{{ 'dept_name_ru' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="form.nameRu" /></div>
          <div class="field full"><label class="label">{{ 'dept_name_en' | t }} <span class="req">*</span></label><input class="input" [(ngModel)]="form.nameEn" /></div>
        </div>
        <div footer>
          <button class="btn" type="button" (click)="editing.set(null)">{{ 'cancel' | t }}</button>
          <button class="btn btn-primary" type="button" (click)="save()" [disabled]="busy() || !form.code || !form.nameUz">{{ 'save' | t }}</button>
        </div>
      </ui-modal>
    }
  `,
})
export class DepartmentsComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly stages = STAGES;
  readonly items = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly editing = signal<Partial<Department> | null>(null);
  form: Record<string, any> = {};

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.get<Department[]>('/departments').subscribe({
      next: (d) => { this.items.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  open(d: Partial<Department>): void {
    this.form = { code: d.code ?? '', nameUz: d.nameUz ?? '', nameRu: d.nameRu ?? '', nameEn: d.nameEn ?? '', stage: d.stage ?? '' };
    this.editing.set(d);
  }

  save(): void {
    this.busy.set(true);
    const body = { ...this.form };
    if (!body['stage']) delete body['stage'];
    const id = this.editing()?.id;
    const req = id ? this.api.patch(`/departments/${id}`, body) : this.api.post('/departments', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success(this.i18n.t('saved')); this.load(); },
      error: () => this.busy.set(false),
    });
  }
}
