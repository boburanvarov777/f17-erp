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
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { FieldErrorsState, runValidation } from '../../shared/utils/form-validate';

const STAGES: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

@Component({
  selector: 'app-departments',
  templateUrl: './departments.component.html',
  standalone: true,
  imports: [FormsModule, IconComponent, EmptyComponent, LoadingComponent, ModalComponent, StatusBadgeComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  readonly fe = new FieldErrorsState();
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
    this.fe.reset();
    this.form = { code: d.code ?? '', nameUz: d.nameUz ?? '', nameRu: d.nameRu ?? '', nameEn: d.nameEn ?? '', stage: d.stage ?? '' };
    this.editing.set(d);
  }

  save(): void {
    const t = (k: string, p?: Record<string, unknown>) => this.i18n.t(k, p as any);
    if (!this.fe.apply(runValidation([
      { key: 'code', label: t('code'), value: this.form['code'], required: true },
      { key: 'nameUz', label: t('dept_name_uz'), value: this.form['nameUz'], required: true },
    ], t))) return;

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
