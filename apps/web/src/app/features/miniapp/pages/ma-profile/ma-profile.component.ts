import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { InitialsPipe } from '../../../../shared/pipes/format.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MiniAppService } from '../../services/miniapp.service';

@Component({
  selector: 'app-ma-profile',
  templateUrl: './ma-profile.component.html',
  styleUrl: './ma-profile.component.scss',
  standalone: true,
  imports: [IconComponent, TPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaProfileComponent {
  readonly ma = inject(MiniAppService);
  readonly auth = inject(AuthService);
}
