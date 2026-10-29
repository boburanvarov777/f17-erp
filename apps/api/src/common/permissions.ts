import { forbidden } from './i18n/api-errors';

export const PERMISSIONS = [
  'dashboard.read',
  // *.delete = archive (soft). *.purge = permanent delete from the database.
  'orders.read', 'orders.create', 'orders.update', 'orders.delete', 'orders.purge',
  'models.read', 'models.create', 'models.update', 'models.delete', 'models.purge',
  'warehouse.read', 'warehouse.create', 'warehouse.update', 'warehouse.delete', 'warehouse.purge',
  // <stage>.purge = permanently delete an order from that stage's page.
  'cutting.read', 'cutting.create', 'cutting.update', 'cutting.purge',
  'sewing.read', 'sewing.create', 'sewing.update', 'sewing.purge',
  'washing.read', 'washing.create', 'washing.update', 'washing.purge',
  'laser.read', 'laser.create', 'laser.update', 'laser.purge',
  'packing.read', 'packing.create', 'packing.update', 'packing.purge',
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

/** Permanent-delete permissions — granted to every role (see seed), editable in Rollar. */
export const PURGE_PERMISSIONS = [
  'orders.purge', 'models.purge', 'warehouse.purge',
  'cutting.purge', 'sewing.purge', 'washing.purge', 'laser.purge', 'packing.purge',
] as const;

export const STAGE_PERMISSION_PREFIX: Record<string, string> = {
  CUTTING: 'cutting',
  SEWING: 'sewing',
  WASHING: 'washing',
  LASER: 'laser',
  PACKING: 'packing',
  LOADING: 'loading',
};

/** Full access marker — Super Pro Admin bypasses granular checks. */
export const ALL_PERMISSIONS = '*';

export const SUPER_PRO_ADMIN_ROLE = 'SUPER_PRO_ADMIN';

/** Primary owner account — never block, archive, or delete (see SEED_SUPERADMIN_LOGIN). */
export const ROOT_USER_LOGIN = (process.env.SEED_SUPERADMIN_LOGIN || 'bobur').trim().toLowerCase();

export function isProtectedUser(user: { login?: string } | null | undefined): boolean {
  return (user?.login?.trim().toLowerCase() ?? '') === ROOT_USER_LOGIN;
}

export function isSuperProAdmin(user: { roleCode?: string; permissions?: string[] } | null | undefined): boolean {
  if (!user) return false;
  return user.roleCode === SUPER_PRO_ADMIN_ROLE;
}

export function isTopAdmin(user: { roleCode?: string } | null | undefined): boolean {
  if (!user) return false;
  return user.roleCode === SUPER_PRO_ADMIN_ROLE || user.roleCode === 'SUPER_ADMIN';
}

export function assertTopAdmin(user: { roleCode?: string } | null | undefined): void {
  if (!isTopAdmin(user)) throw forbidden('err_archive_forbidden');
}

export function assertSuperProAdmin(user: { roleCode?: string } | null | undefined): void {
  if (!isSuperProAdmin(user)) throw forbidden('err_roles_super_only');
}

/** Super Admin: everything except role management, audit logs, and user deletion. */
export const SUPER_ADMIN_PERMISSIONS = PERMISSIONS.filter(
  (p) => !p.startsWith('roles.') && p !== 'audit.read' && p !== 'users.delete',
);

/** True when the user's role grants `permission` (Super Pro Admin's "*" grants all). */
export function hasPermission(user: { permissions?: string[] } | null | undefined, permission: string): boolean {
  const perms = user?.permissions ?? [];
  return perms.includes(ALL_PERMISSIONS) || perms.includes(permission);
}
