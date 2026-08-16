import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { filterNavGroups } from '../../core/nav.config';
import { TPipe } from '../../shared/pipes/t.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { MiniAppService } from './miniapp.service';

@Component({
  selector: 'app-ma-menu',
  standalone: true,
  imports: [RouterLink, IconComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ma.user(); as u) {
      <div class="role-card mb-3">
        <div class="small bold">{{ u.fullName }}</div>
        <div class="row gap-2 mt-2">
          <span class="badge badge-info">{{ u.role?.name }}</span>
          @if (u.department) { <span class="badge badge-neutral">{{ u.department.name }}</span> }
        </div>
      </div>
    }

    @for (g of groups(); track g.label ?? $index) {
      @if (g.label) { <div class="grp-label">{{ g.label | t }}</div> }
      <div class="menu-grid mb-3">
        @for (it of g.items; track it.path) {
          <a class="menu-item" [routerLink]="['/miniapp', it.path]">
            <ui-icon [name]="it.icon" [size]="20" />
            <span>{{ it.label | t }}</span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .role-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 14px; }
    .grp-label { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); margin: 8px 2px 6px; }
    .menu-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .menu-item {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      min-height: 88px; padding: 12px 8px; text-align: center;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg);
      color: var(--text-2); text-decoration: none; font-size: 11.5px; font-weight: 500; line-height: 1.2;
    }
    .menu-item:active { background: var(--surface-3); }
  `],
})
export class MaMenuComponent {
  readonly ma = inject(MiniAppService);

  readonly groups = computed(() => filterNavGroups((...p) => this.ma.can(...p)));
}
