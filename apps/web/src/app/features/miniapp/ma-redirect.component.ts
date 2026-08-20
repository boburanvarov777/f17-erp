import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { getMiniAppHomeRoute } from './miniapp-nav.config';
import { MiniAppService } from './miniapp.service';

@Component({
  selector: 'app-ma-redirect',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaRedirectComponent implements OnInit {
  private router = inject(Router);
  private ma = inject(MiniAppService);

  ngOnInit(): void {
    void this.router.navigateByUrl(getMiniAppHomeRoute(this.ma.user()));
  }
}
