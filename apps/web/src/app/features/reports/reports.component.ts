import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NumPipe } from '../../shared/pipes/format.pipe';
import { TPipe } from '../../shared/pipes/t.pipe';
import { EmptyComponent, LoadingComponent } from '../../shared/ui/empty.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

interface ProductionReport {
  totals: { qty: number; defect: number; operations: number };
  byStage: { stage: string; qty: number; defect: number; operations: number }[];
  byUser: { user: string; qty: number; defect: number; operations: number }[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule, IconComponent, StatusBadgeComponent, EmptyComponent, LoadingComponent, TPipe, NumPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="title">{{ 'reports_title' | t }}</div>
          <div class="sub">{{ from }} — {{ to }}</div>
        </div>
        <div class="row gap-2">
          <input class="input btn-sm" style="width:150px;height:32px" type="date" [(ngModel)]="from" (ngModelChange)="load()" />
          <input class="input btn-sm" style="width:150px;height:32px" type="date" [(ngModel)]="to" (ngModelChange)="load()" />
          <button class="btn btn-sm" type="button" (click)="print()"><ui-icon name="printer" [size]="15" /> {{ 'print' | t }}</button>
        </div>
      </div>

      <div class="tabs mb-4 no-print">
        @for (t of tabs; track t.key) {
          <button type="button" [class.active]="tab() === t.key" (click)="tab.set(t.key); load()">{{ t.label | t }}</button>
        }
      </div>

      @if (loading()) { <ui-loading [count]="5" [height]="60" /> }
      @else {
        @switch (tab()) {
          @case ('production') {
            @if (production(); as p) {
              <div class="stats mb-6">
                <div class="stat"><div class="k">{{ 'produced' | t }}</div><div class="v">{{ p.totals.qty | num }}</div></div>
                <div class="stat"><div class="k">{{ 'defect_label' | t }}</div><div class="v" style="color:var(--danger)">{{ p.totals.defect | num }}</div></div>
                <div class="stat"><div class="k">{{ 'operations' | t }}</div><div class="v">{{ p.totals.operations | num }}</div></div>
              </div>
              <div class="grid two">
                <div class="card">
                  <div class="card-head"><h3>{{ 'by_stage' | t }}</h3></div>
                  <div class="table-wrap">
                    <table class="data">
                      <thead><tr><th>{{ 'stage' | t }}</th><th class="num">{{ 'produced' | t }}</th><th class="num">{{ 'defect_label' | t }}</th><th class="num">{{ 'operations' | t }}</th></tr></thead>
                      <tbody>
                        @for (s of p.byStage; track s.stage) {
                          <tr><td>{{ 'stage_' + s.stage | t }}</td><td class="num bold">{{ s.qty | num }}</td><td class="num">{{ s.defect | num }}</td><td class="num text-3">{{ s.operations }}</td></tr>
                        } @empty { <tr><td colspan="4"><ui-empty icon="info" [title]="'no_data' | t" /></td></tr> }
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="card">
                  <div class="card-head"><h3>{{ 'by_employee' | t }}</h3></div>
                  <div class="table-wrap">
                    <table class="data">
                      <thead><tr><th>{{ 'full_name' | t }}</th><th class="num">{{ 'produced' | t }}</th><th class="num">{{ 'defect_label' | t }}</th><th class="num">{{ 'operations' | t }}</th></tr></thead>
                      <tbody>
                        @for (u of p.byUser; track u.user) {
                          <tr><td>{{ u.user }}</td><td class="num bold">{{ u.qty | num }}</td><td class="num">{{ u.defect | num }}</td><td class="num text-3">{{ u.operations }}</td></tr>
                        } @empty { <tr><td colspan="4"><ui-empty icon="info" [title]="'no_data' | t" /></td></tr> }
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            }
          }
          @case ('orders') {
            <div class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'status' | t }}</th><th class="num">{{ 'orders_title' | t }}</th><th class="num">{{ 'quantity' | t }}</th></tr></thead>
                  <tbody>
                    @for (r of orders(); track r.status) {
                      <tr><td><ui-status [value]="r.status" /></td><td class="num bold">{{ r.orders }}</td><td class="num">{{ r.qty | num }}</td></tr>
                    } @empty { <tr><td colspan="3"><ui-empty icon="info" [title]="'no_data' | t" /></td></tr> }
                  </tbody>
                </table>
              </div>
            </div>
          }
          @case ('defects') {
            <div class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'stage' | t }}</th><th>{{ 'defect_type' | t }}</th><th class="num">{{ 'quantity' | t }}</th><th class="num">Yozuvlar</th></tr></thead>
                  <tbody>
                    @for (r of defects(); track r.stage + r.type) {
                      <tr><td>{{ 'stage_' + r.stage | t }}</td><td>{{ r.type }}</td><td class="num bold" style="color:var(--danger)">{{ r.qty | num }}</td><td class="num text-3">{{ r.count }}</td></tr>
                    } @empty { <tr><td colspan="4"><ui-empty icon="check-circle" title="Brak yo‘q" /></td></tr> }
                  </tbody>
                </table>
              </div>
            </div>
          }
          @case ('warehouse') {
            <div class="card">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>{{ 'code' | t }}</th><th>{{ 'material' | t }}</th><th class="num">{{ 'current_stock' | t }}</th><th class="num">{{ 'reserved' | t }}</th><th class="num">{{ 'available' | t }}</th><th class="num">Qiymat</th><th>{{ 'status' | t }}</th></tr></thead>
                  <tbody>
                    @for (r of warehouse(); track r.code) {
                      <tr>
                        <td class="mono small">{{ r.code }}</td><td>{{ r.name }}</td>
                        <td class="num">{{ r.stock | num: 2 }} {{ r.unit }}</td>
                        <td class="num">{{ r.reserved | num: 2 }}</td>
                        <td class="num bold">{{ r.available | num: 2 }}</td>
                        <td class="num">{{ r.value ? (r.value | num) : '—' }}</td>
                        <td><ui-status [value]="r.status" /></td>
                      </tr>
                    } @empty { <tr><td colspan="7"><ui-empty icon="boxes" [title]="'no_data' | t" /></td></tr> }
                  </tbody>
                </table>
              </div>
              <div class="card-foot row-between">
                <b class="small">{{ 'total' | t }}</b>
                <b>{{ warehouseValue() | num }} so‘m</b>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`.grid.two { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }`],
})
export class ReportsComponent {
  private api = inject(ApiService);

  readonly tabs = [
    { key: 'production', label: 'rep_production' },
    { key: 'orders', label: 'rep_orders' },
    { key: 'defects', label: 'rep_defects' },
    { key: 'warehouse', label: 'rep_warehouse' },
  ];

  readonly tab = signal('production');
  readonly loading = signal(false);
  readonly production = signal<ProductionReport | null>(null);
  readonly orders = signal<{ status: string; orders: number; qty: number }[]>([]);
  readonly defects = signal<{ stage: string; type: string; qty: number; count: number }[]>([]);
  readonly warehouse = signal<any[]>([]);

  from = '';
  to = '';

  readonly warehouseValue = computed(() => this.warehouse().reduce((a, r) => a + (r.value ?? 0), 0));

  constructor() {
    const d = new Date();
    this.to = d.toISOString().slice(0, 10);
    d.setMonth(d.getMonth() - 1);
    this.from = d.toISOString().slice(0, 10);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const params = { from: this.from, to: this.to };
    const done = () => this.loading.set(false);

    switch (this.tab()) {
      case 'production':
        this.api.get<ProductionReport>('/reports/production', params).subscribe({ next: (r) => { this.production.set(r); done(); }, error: done });
        break;
      case 'orders':
        this.api.get<any[]>('/reports/orders', params).subscribe({ next: (r) => { this.orders.set(r); done(); }, error: done });
        break;
      case 'defects':
        this.api.get<any[]>('/reports/defects', params).subscribe({ next: (r) => { this.defects.set(r); done(); }, error: done });
        break;
      case 'warehouse':
        this.api.get<any[]>('/reports/warehouse').subscribe({ next: (r) => { this.warehouse.set(r); done(); }, error: done });
        break;
    }
  }

  print(): void { window.print(); }
}
