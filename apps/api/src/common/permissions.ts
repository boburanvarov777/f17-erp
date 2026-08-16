export const PERMISSIONS = [
  'dashboard.read',
  'orders.read', 'orders.create', 'orders.update', 'orders.delete',
  'models.read', 'models.create', 'models.update', 'models.delete',
  'warehouse.read', 'warehouse.create', 'warehouse.update', 'warehouse.delete',
  'cutting.read', 'cutting.create', 'cutting.update',
  'sewing.read', 'sewing.create', 'sewing.update',
  'washing.read', 'washing.create', 'washing.update',
  'laser.read', 'laser.create', 'laser.update',
  'packing.read', 'packing.create', 'packing.update',
  'loading.read', 'loading.create', 'loading.update',
  'schedule.read', 'schedule.update',
  'users.read', 'users.create', 'users.update', 'users.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.delete',
  'departments.read', 'departments.create', 'departments.update', 'departments.delete',
  'clients.read', 'clients.create', 'clients.update', 'clients.delete',
  'tasks.read', 'tasks.create', 'tasks.update', 'tasks.delete',
  'plans.read', 'plans.update',
  'reports.read',
  'audit.read',
  'settings.update',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const STAGE_PERMISSION_PREFIX: Record<string, string> = {
  CUTTING: 'cutting',
  SEWING: 'sewing',
  WASHING: 'washing',
  LASER: 'laser',
  PACKING: 'packing',
  LOADING: 'loading',
};

/** Full access marker — Super Admin bypasses granular checks. */
export const ALL_PERMISSIONS = '*';
