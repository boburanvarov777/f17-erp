import type { CurrentUser } from './models';

const TOP_ADMIN_ROLES = new Set(['SUPER_PRO_ADMIN', 'SUPER_ADMIN']);
const FULL_MANAGE_ROLES = new Set(['SUPER_PRO_ADMIN', 'SUPER_ADMIN', 'PRODUCTION_MANAGER', 'PLANNING']);

/** Audit logs, role management, and full system control — Super Pro Admin only. */
export function isSuperProAdmin(u: CurrentUser | null | undefined): boolean {
  return u?.role?.code === 'SUPER_PRO_ADMIN';
}

/** Primary owner (bobur) — cannot be deleted or blocked. */
export const PROTECTED_USER_LOGIN = 'bobur';

export function isProtectedUser(u: { login?: string } | null | undefined): boolean {
  return (u?.login?.trim().toLowerCase() ?? '') === PROTECTED_USER_LOGIN;
}

export function isTopAdmin(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  return TOP_ADMIN_ROLES.has(u.role?.code ?? '');
}

/** Company-wide dashboard: KPIs, all stages, cross-department plans. */
export function seesFullManage(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  return FULL_MANAGE_ROLES.has(u.role?.code ?? '');
}

/** Department stage head — own stage metrics only (Kesim, Tikuv, …). */
export function seesDeptManage(u: CurrentUser | null | undefined): boolean {
  if (!u || seesFullManage(u)) return false;
  return !!u.department?.stage;
}

/** Warehouse staff — ombor mini app (not production floor). */
export function isWarehouseUser(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  if (u.role?.code === 'WAREHOUSE_MANAGER') return true;
  return u.department?.code === 'WAREHOUSE';
}

/** Show Boshqaruv tab (miniapp) / manage section. */
export function seesManageTab(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  if (u.role?.code === 'ADMIN') return false;
  if (seesFullManage(u) || seesDeptManage(u)) return true;
  const p = u.permissions ?? [];
  return p.includes('plans.update') && p.includes('users.read');
}

export function userStage(u: CurrentUser | null | undefined): string | null {
  return u?.department?.stage ?? null;
}

export function userDepartmentId(u: CurrentUser | null | undefined): string | null {
  return u?.department?.id ?? null;
}
