/** Maps API permission module keys to i18n dict keys (nav_* where available). */
export const PERMISSION_MODULE_I18N: Record<string, string> = {
  dashboard: 'nav_dashboard',
  orders: 'nav_orders',
  models: 'nav_models',
  warehouse: 'nav_warehouse',
  cutting: 'nav_cutting',
  sewing: 'nav_sewing',
  washing: 'nav_washing',
  laser: 'nav_laser',
  packing: 'nav_packing',
  loading: 'nav_loading',
  schedule: 'nav_schedule',
  users: 'nav_users',
  roles: 'nav_roles',
  departments: 'nav_departments',
  clients: 'perm_clients',
  tasks: 'perm_tasks',
  plans: 'perm_plans',
  reports: 'nav_reports',
  audit: 'nav_audit',
  settings: 'settings',
};

export const PERMISSION_ACTION_I18N: Record<string, string> = {
  read: 'perm_read',
  create: 'perm_create',
  update: 'perm_update',
  delete: 'perm_delete',
};

export function permModuleKey(module: string): string {
  return PERMISSION_MODULE_I18N[module] ?? module;
}

export function permActionKey(permission: string): string {
  return PERMISSION_ACTION_I18N[permission.split('.')[1] ?? ''] ?? permission.split('.')[1] ?? permission;
}
