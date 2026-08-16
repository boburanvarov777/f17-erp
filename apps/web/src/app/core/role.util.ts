import type { CurrentUser } from './models';

const TOP_ADMIN_ROLES = new Set(['SUPER_PRO_ADMIN', 'SUPER_ADMIN']);
const FULL_MANAGE_ROLES = new Set(['SUPER_PRO_ADMIN', 'SUPER_ADMIN', 'PRODUCTION_MANAGER', 'PLANNING']);

export function isTopAdmin(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  if (u.permissions?.includes('*')) return true;
  return TOP_ADMIN_ROLES.has(u.role?.code ?? '');
}

/** Company-wide dashboard: KPIs, all stages, cross-department plans. */
export function seesFullManage(u: CurrentUser | null | undefined): boolean {
  if (!u) return false;
  if (u.permissions?.includes('*')) return true;
  return FULL_MANAGE_ROLES.has(u.role?.code ?? '');
}

/** Department stage head — own stage metrics only (Kesim, Tikuv, …). */
export function seesDeptManage(u: CurrentUser | null | undefined): boolean {
  if (!u || seesFullManage(u)) return false;
  return !!u.department?.stage;
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
