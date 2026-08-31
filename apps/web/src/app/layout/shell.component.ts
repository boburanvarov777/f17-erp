import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { filterNavGroupsForUser } from '../core/nav-filter';
import { AuthService } from '../core/services/auth.service';
import { I18nService } from '../core/services/i18n.service';
import { NotificationService } from '../core/services/notification.service';
import { RealtimeService } from '../core/services/realtime.service';
import { ThemeService } from '../core/services/theme.service';
import { AgoPipe, InitialsPipe } from '../shared/pipes/format.pipe';
import { TPipe } from '../shared/pipes/t.pipe';
import { IconComponent } from '../shared/ui/icon.component';
import { LangPickerComponent } from '../shared/ui/lang-picker.component';
import { GlobalSearchComponent } from './global-search.component';
import type { Lang } from '../core/models';

interface NavItem { label: string; icon: string; link: string; perms?: string[]; }
interface NavGroup { label?: string; items: NavItem[]; }

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, LangPickerComponent, TPipe, AgoPipe, InitialsPipe, GlobalSearchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly theme = inject(ThemeService);
  readonly notif = inject(NotificationService);
  readonly rt = inject(RealtimeService);
  private router = inject(Router);

  readonly collapsed = signal(localStorage.getItem('f17_nav_collapsed') === '1');
  readonly mobileOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly open = signal<string | null>(null);
  readonly user = this.auth.user;

  /** Sidebar shrinks to what the signed-in role is actually allowed to open. */
  readonly groups = computed<NavGroup[]>(() =>
    filterNavGroupsForUser((...p) => this.auth.can(...p), this.auth.user()).map((g) => ({
      ...g,
      items: g.items.map((i) => ({ ...i, link: `/${i.path}` })),
    })),
  );

  private notifTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.notif.load();
    this.rt.connect();

    effect(() => localStorage.setItem('f17_nav_collapsed', this.collapsed() ? '1' : '0'));
    effect(() => {
      this.rt.tick();
      clearTimeout(this.notifTimer);
      this.notifTimer = setTimeout(() => this.notif.load(), 800);
    });

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.mobileOpen.set(false);
      this.open.set(null);
    });
  }

  toggle(key: string): void {
    this.open.update((v) => (v === key ? null : key));
    if (key === 'bell') this.notif.load();
  }

  setLang(l: Lang): void {
    this.i18n.set(l);
  }

  openNotif(id: string, link?: string): void {
    this.notif.markRead(id);
    this.open.set(null);
    if (link) void this.router.navigateByUrl(link);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.searchOpen.set(true);
    }
    if (e.key === 'Escape') {
      this.open.set(null);
    }
  }

  @HostListener('document:click', ['$event'])
  onClick(e: MouseEvent): void {
    const el = e.target as HTMLElement;
    if (!el.closest('.dropdown')) this.open.set(null);
  }
}
