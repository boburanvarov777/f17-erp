import type { CurrentUser } from './models';
import { NAV_GROUPS, type NavGroupDef, type NavItemDef } from './nav.config';
import { isSuperProAdmin, seesFullManage, userStage } from './role.util';

function withoutAudit(groups: NavGroupDef[]): NavGroupDef[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.path !== 'audit') }))
    .filter((g) => g.items.length > 0);
}

export function filterNavGroups(can: (...perms: string[]) => boolean): NavGroupDef[] {
  const pick = (items: NavItemDef[]) => items.filter((i) => !i.perms?.length || can(...i.perms));
  return NAV_GROUPS.map((g) => ({ ...g, items: pick(g.items) })).filter((g) => g.items.length > 0);
}

/** Web sidebar — top admins see all; stage workers see only their stage. */
export function filterNavGroupsForUser(
  can: (...perms: string[]) => boolean,
  user: CurrentUser | null | undefined,
): NavGroupDef[] {
  let groups = filterNavGroups(can);
  if (!isSuperProAdmin(user)) groups = withoutAudit(groups);
  if (seesFullManage(user)) return groups;

  if (user?.role?.code === 'ADMIN') {
    groups = groups.filter((g) => g.label !== 'nav_management');
  }

  const stage = userStage(user)?.toLowerCase();
  if (stage) {
    groups = groups
      .map((g) => {
        if (g.label === 'nav_production') {
          return { ...g, items: g.items.filter((i) => i.path === `production/${stage}`) };
        }
        if (!g.label) {
          return { ...g, items: g.items.filter((i) => i.path === 'dashboard') };
        }
        return g;
      })
      .filter((g) => g.items.length > 0);
  }

  return groups;
}