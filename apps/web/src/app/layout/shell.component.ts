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
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, IconComponent, LangPickerComponent, TPipe, AgoPipe, InitialsPipe, GlobalSearchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.collapsed]="collapsed()" [class.mobile-open]="mobileOpen()">
      <!-- ───────── sidebar ───────── -->
      <aside class="sidebar no-print">
        <div class="brand">
          <div class="brand-mark">F17</div>
          @if (!collapsed()) {
            <div class="brand-text">
              <div class="brand-1">{{ 'app_short' | t }}</div>
              <div class="brand-2">{{ 'denim_erp' | t }}</div>
            </div>
          }
        </div>

        <nav class="nav">
          @for (g of groups(); track $index) {
            @if (g.items.length) {
              @if (g.label && !collapsed()) { <div class="nav-label">{{ g.label | t }}</div> }
              @if (g.label && collapsed()) { <div class="nav-sep"></div> }
              @for (it of g.items; track it.link) {
                <a class="nav-item" [routerLink]="it.link" routerLinkActive="active"
                   [attr.data-tip]="collapsed() ? (it.label | t) : null"
                   [attr.data-tip-prefer]="collapsed() ? 'right' : null">
                  <ui-icon [name]="it.icon" [size]="17.5" />
                  @if (!collapsed()) { <span>{{ it.label | t }}</span> }
                </a>
              }
            }
          }
        </nav>

        <div class="nav-foot">
          <button class="nav-item as-btn" type="button" (click)="collapsed.set(!collapsed())" [attr.data-tip]="collapsed() ? ('nav_expand' | t) : ('nav_collapse' | t)">
            <ui-icon name="panel-left" [size]="17.5" />
            @if (!collapsed()) { <span>{{ 'collapse_nav' | t }}</span> }
          </button>
        </div>
      </aside>

      <!-- ───────── main ───────── -->
      <div class="main">
        <header class="topbar no-print" data-tip-zone="bottom">
          <button class="btn btn-ghost btn-icon burger" type="button" (click)="mobileOpen.set(!mobileOpen())" [attr.data-tip]="'menu' | t">
            <ui-icon name="menu" [size]="19" />
          </button>

          <button class="search-trigger" type="button" (click)="searchOpen.set(true)" [attr.data-tip]="'search' | t">
            <ui-icon name="search" [size]="16" />
            <span class="grow">{{ 'search_placeholder' | t }}</span>
            <span class="kbd">{{ 'keyboard_ctrl_k' | t }}</span>
          </button>

          <div class="grow"></div>

          <div class="row gap-1">
            <span class="conn" [class.on]="rt.connected()"
                  [attr.data-tip]="rt.connected() ? ('connected' | t) : ('disconnected' | t)"
                  data-tip-prefer="bottom">
              <ui-icon [name]="rt.connected() ? 'wifi' : 'wifi-off'" [size]="15" />
            </span>

            <!-- language -->
            <ui-lang-picker variant="compact" [current]="i18n.lang()" (changed)="setLang($event)" />

            <!-- theme -->
            <button class="btn btn-ghost btn-icon btn-sm" type="button" (click)="theme.toggle()" [attr.data-tip]="'theme' | t">
              <ui-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="16" />
            </button>

            <!-- notifications -->
            <div class="dropdown">
              <button class="btn btn-ghost btn-icon btn-sm bell" type="button" (click)="toggle('bell')" [attr.data-tip]="'notifications' | t">
                <ui-icon name="bell" [size]="17" />
                @if (notif.unread() > 0) { <i class="dot-badge">{{ notif.unread() > 9 ? '9+' : notif.unread() }}</i> }
              </button>
              @if (open() === 'bell') {
                <div class="menu notif-menu">
                  <div class="row-between" style="padding:10px 12px;border-bottom:1px solid var(--border)">
                    <b class="small">{{ 'notifications' | t }}</b>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="notif.markAllRead()" [attr.data-tip]="'mark_all_read' | t">{{ 'mark_all_read' | t }}</button>
                  </div>
                  <div class="notif-list">
                    @for (n of notif.items(); track n.id) {
                      <button class="notif" type="button" [class.unread]="!n.isRead" (click)="openNotif(n.id, n.link)">
                        <div class="row-between gap-2">
                          <b class="small">{{ n.title }}</b>
                          <span class="tiny text-3 nowrap">{{ n.createdAt | ago }}</span>
                        </div>
                        @if (n.body) { <div class="tiny text-3 mt-2">{{ n.body }}</div> }
                      </button>
                    } @empty {
                      <div class="empty" style="padding:28px"><span class="small">{{ 'no_notifications' | t }}</span></div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- profile -->
            <div class="dropdown">
              <button class="profile-btn" type="button" (click)="toggle('user')" [attr.data-tip]="'profile' | t">
                <span class="avatar sm">{{ (user()?.firstName | initials: user()?.lastName) }}</span>
                <span class="who">
                  <span class="n">{{ user()?.fullName }}</span>
                  <span class="r">{{ user()?.role?.name }}</span>
                </span>
                <ui-icon name="chevron-down" [size]="14" />
              </button>
              @if (open() === 'user') {
                <div class="menu" style="min-width:230px">
                  <div style="padding:12px;border-bottom:1px solid var(--border)">
                    <div class="bold">{{ user()?.fullName }}</div>
                    <div class="tiny text-3">{{ user()?.department?.name || user()?.position }}</div>
                  </div>
                  <a class="menu-item" routerLink="/profile" (click)="open.set(null)">
                    <ui-icon name="user" [size]="15" /><span>{{ 'profile' | t }}</span>
                  </a>
                  <a class="menu-item" routerLink="/profile" [queryParams]="{ tab: 'password' }" (click)="open.set(null)">
                    <ui-icon name="key-round" [size]="15" /><span>{{ 'change_password' | t }}</span>
                  </a>
                  <div class="divider" style="margin:4px 0"></div>
                  <button class="menu-item danger" type="button" (click)="auth.logout()" [attr.data-tip]="'logout' | t">
                    <ui-icon name="log-out" [size]="15" /><span>{{ 'logout' | t }}</span>
                  </button>
                </div>
              }
            </div>
          </div>
        </header>

        <main class="content"><router-outlet /></main>
      </div>

      @if (mobileOpen()) { <div class="scrim" (click)="mobileOpen.set(false)"></div> }
      @if (searchOpen()) { <app-global-search (closed)="searchOpen.set(false)" /> }
    </div>
  `,
  styles: [`
    .shell { display: flex; min-height: 100vh; }

    .sidebar {
      width: var(--sidebar-w); flex: 0 0 auto;
      background: linear-gradient(180deg, var(--nav-bg) 0%, var(--nav-bg-2) 100%);
      display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
      border-right: 1px solid var(--nav-border); z-index: 60;
      transition: width .18s cubic-bezier(.4,0,.2,1);
    }
    .collapsed .sidebar { width: 64px; }

    .brand { display: flex; align-items: center; gap: 11px; padding: 16px 16px 14px; border-bottom: 1px solid var(--nav-border); height: var(--topbar-h); }
    .brand-mark {
      width: 32px; height: 32px; border-radius: 8px; flex: 0 0 auto;
      background: linear-gradient(135deg, #2f5da8, #1b3a6b);
      color: #fff; font-weight: 700; font-size: 11.5px; letter-spacing: .02em;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(47,93,168,.4);
    }
    .brand-text { overflow: hidden; }
    .brand-1 { color: #fff; font-weight: 600; font-size: 13px; letter-spacing: .04em; white-space: nowrap; }
    .brand-2 { color: var(--nav-text); font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; opacity: .75; }

    .nav { flex: 1; overflow-y: auto; padding: 10px 8px; display: flex; flex-direction: column; gap: 1px; }
    .nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); background-clip: content-box; }
    .nav-label { color: rgba(255,255,255,.38); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 14px 10px 5px; }
    .nav-sep { height: 1px; background: var(--nav-border); margin: 9px 6px; }
    .nav-item {
      display: flex; align-items: center; gap: 11px;
      padding: 9px 10px; border-radius: 8px; color: var(--nav-text);
      font-size: 13.5px; font-weight: 450; text-decoration: none; white-space: nowrap;
      border: none; background: none; cursor: pointer; width: 100%; text-align: left;
      transition: background .12s ease, color .12s ease;
    }
    .nav-item:hover { background: var(--nav-hover); color: #fff; text-decoration: none; }
    .nav-item.active { background: var(--nav-active); color: var(--nav-text-active); font-weight: 550; box-shadow: inset 2px 0 0 var(--primary-500); }
    .collapsed .nav-item { justify-content: center; padding: 10px 0; }
    .nav-foot { padding: 8px; border-top: 1px solid var(--nav-border); }

    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    .topbar {
      height: var(--topbar-h); flex: 0 0 auto;
      display: flex; align-items: center; gap: 10px; padding: 0 18px;
      background: var(--surface); border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 50;
    }
    .burger { display: none; }

    .search-trigger {
      display: flex; align-items: center; gap: 9px;
      height: 34px; min-width: 230px; max-width: 400px; padding: 0 10px;
      border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2);
      color: var(--text-3); font-size: 13px; cursor: pointer; text-align: left;
    }
    .search-trigger:hover { border-color: var(--border-strong); background: var(--surface-3); }

    .conn { display: inline-flex; padding: 6px; color: var(--text-3); }
    .conn.on { color: var(--success); }
    .uppercase { text-transform: uppercase; font-size: 12px; font-weight: 600; }

    .dropdown { position: relative; }
    .menu {
      position: absolute; right: 0; top: calc(100% + 7px);
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg);
      box-shadow: var(--sh-3); min-width: 190px; padding: 5px; z-index: 120;
      animation: pop .13s cubic-bezier(.2,.8,.3,1);
    }
    .menu-item {
      display: flex; align-items: center; gap: 9px; width: 100%;
      padding: 8px 10px; border: none; background: none; border-radius: var(--r-sm);
      font-size: 13.5px; color: var(--text); cursor: pointer; text-align: left; text-decoration: none;
    }
    .menu-item:hover { background: var(--surface-3); text-decoration: none; }
    .menu-item.danger { color: var(--danger); }

    .bell { position: relative; }
    .dot-badge {
      position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; padding: 0 3px;
      background: var(--danger); color: #fff; border-radius: 100px;
      font-size: 9.5px; font-weight: 700; font-style: normal;
      display: flex; align-items: center; justify-content: center; border: 2px solid var(--surface);
    }
    .notif-menu { width: 360px; padding: 0; }
    .notif-list { max-height: 400px; overflow-y: auto; }
    .notif { display: block; width: 100%; text-align: left; padding: 10px 12px; border: none; border-bottom: 1px solid var(--border); background: none; cursor: pointer; }
    .notif:hover { background: var(--surface-2); }
    .notif.unread { background: var(--primary-50); }
    .notif.unread:hover { background: var(--primary-100); }

    .profile-btn {
      display: flex; align-items: center; gap: 9px; height: 38px; padding: 0 8px 0 5px;
      border: 1px solid transparent; border-radius: var(--r); background: none; cursor: pointer;
    }
    .profile-btn:hover { background: var(--surface-3); }
    .who { display: flex; flex-direction: column; line-height: 1.25; text-align: left; }
    .who .n { font-size: 12.8px; font-weight: 550; }
    .who .r { font-size: 11px; color: var(--text-3); }

    .content { flex: 1; min-width: 0; }
    .scrim { position: fixed; inset: 0; background: var(--overlay); z-index: 55; }

    @media (max-width: 1024px) {
      .burger { display: inline-flex; }
      .sidebar { position: fixed; left: 0; top: 0; transform: translateX(-100%); transition: transform .2s ease; }
      .mobile-open .sidebar { transform: translateX(0); }
      .who { display: none; }
      .search-trigger { min-width: 0; }
      .search-trigger span:not(.kbd) { display: none; }
      .kbd { display: none; }
    }
  `],
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
