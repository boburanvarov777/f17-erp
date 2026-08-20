import type { CurrentUser } from '../../core/models';
import { isWarehouseUser } from '../../core/role.util';

export interface MiniAppTab {
  link: string;
  icon: string;
  label: string;
}

const PRODUCTION_TABS: MiniAppTab[] = [
  { link: '/miniapp/report', icon: 'scissors', label: 'ma_orders' },
  { link: '/miniapp/tasks', icon: 'list-checks', label: 'ma_tasks' },
  { link: '/miniapp/home', icon: 'clipboard-list', label: 'ma_plans' },
  { link: '/miniapp/profile', icon: 'user', label: 'ma_profile' },
];

const WAREHOUSE_TABS: MiniAppTab[] = [
  { link: '/miniapp/warehouse', icon: 'boxes', label: 'ma_wh_stock' },
  { link: '/miniapp/warehouse/history', icon: 'history', label: 'ma_wh_history' },
  { link: '/miniapp/warehouse/alerts', icon: 'alert-triangle', label: 'ma_wh_alerts' },
  { link: '/miniapp/profile', icon: 'user', label: 'ma_profile' },
];

export function getMiniAppTabs(user: CurrentUser | null | undefined): MiniAppTab[] {
  if (isWarehouseUser(user)) return WAREHOUSE_TABS;
  return PRODUCTION_TABS;
}

export function getMiniAppHomeRoute(user: CurrentUser | null | undefined): string {
  if (isWarehouseUser(user)) return '/miniapp/warehouse';
  return '/miniapp/report';
}
