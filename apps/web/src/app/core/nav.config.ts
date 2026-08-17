export interface NavItemDef {
  label: string;
  icon: string;
  path: string;
  perms?: string[];
}

export interface NavGroupDef {
  label?: string;
  items: NavItemDef[];
}

/** Shared sidebar — filtered by permissions at runtime. */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    items: [
      { label: 'nav_dashboard', icon: 'layout-dashboard', path: 'dashboard', perms: ['dashboard.read'] },
      { label: 'nav_orders', icon: 'clipboard-list', path: 'orders', perms: ['orders.read'] },
      { label: 'nav_schedule', icon: 'calendar-range', path: 'schedule', perms: ['schedule.read', 'orders.read'] },
      { label: 'nav_models', icon: 'shirt', path: 'models', perms: ['models.read'] },
      { label: 'nav_warehouse', icon: 'boxes', path: 'warehouse', perms: ['warehouse.read'] },
    ],
  },
  {
    label: 'nav_production',
    items: [
      { label: 'nav_cutting', icon: 'scissors', path: 'production/cutting', perms: ['cutting.read'] },
      { label: 'nav_sewing', icon: 'needle', path: 'production/sewing', perms: ['sewing.read'] },
      { label: 'nav_washing', icon: 'droplets', path: 'production/washing', perms: ['washing.read'] },
      { label: 'nav_laser', icon: 'zap', path: 'production/laser', perms: ['laser.read'] },
      { label: 'nav_packing', icon: 'package', path: 'production/packing', perms: ['packing.read'] },
      { label: 'nav_loading', icon: 'truck', path: 'production/loading', perms: ['loading.read'] },
    ],
  },
  {
    label: 'nav_my_tasks',
    items: [
      { label: 'nav_my_tasks', icon: 'list-checks', path: 'my-tasks' },
      { label: 'nav_monitoring', icon: 'chart-column', path: 'monitoring', perms: ['users.read'] },
      { label: 'nav_reports', icon: 'trending-up', path: 'reports', perms: ['reports.read'] },
    ],
  },
  {
    label: 'nav_management',
    items: [
      { label: 'nav_users', icon: 'users', path: 'users', perms: ['users.read'] },
      { label: 'nav_roles', icon: 'shield-check', path: 'roles', perms: ['roles.read'] },
      { label: 'nav_departments', icon: 'building', path: 'departments', perms: ['departments.read'] },
      { label: 'nav_audit', icon: 'scroll-text', path: 'audit' },
    ],
  },
];
