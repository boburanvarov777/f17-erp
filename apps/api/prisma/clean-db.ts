/* eslint-disable no-console */
/**
 * Wipes operational data. Keeps the Boshqaruv section:
 * users, roles, departments, archived orders/models/materials, audit logs,
 * plus sessions and settings so existing logins keep working.
 * Run: npm run clean-db --workspace apps/api
 * Production: set CLEAN_DB=1 so docker-entrypoint runs the compiled script once.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('▸ Cleaning operational data (keeping Boshqaruv)…');

  const result = await prisma.$transaction(
    async (tx) => {
      const archivedOrders = await tx.order.findMany({
        where: { archivedAt: { not: null } },
        select: { modelId: true, clientId: true },
      });
      const archivedModels = await tx.productModel.findMany({
        where: { OR: [{ archivedAt: { not: null } }, { status: 'ARCHIVED' }] },
        select: { id: true, clientId: true },
      });

      const keepModelIds = [
        ...new Set([
          ...archivedModels.map((m) => m.id),
          ...archivedOrders.map((o) => o.modelId).filter((id): id is string => !!id),
        ]),
      ];
      const referencedModels = keepModelIds.length
        ? await tx.productModel.findMany({
            where: { id: { in: keepModelIds } },
            select: { clientId: true },
          })
        : [];
      const keepClientIds = [
        ...new Set([
          ...archivedOrders.map((o) => o.clientId).filter((id): id is string => !!id),
          ...referencedModels.map((m) => m.clientId).filter((id): id is string => !!id),
        ]),
      ];

      const notifications = await tx.notification.deleteMany();
      const tasks = await tx.task.deleteMany();
      const planLines = await tx.planLine.deleteMany();
      const plans = await tx.plan.deleteMany();
      const materials = await tx.material.deleteMany({ where: { archivedAt: null } });
      const orders = await tx.order.deleteMany({ where: { archivedAt: null } });
      const models = keepModelIds.length
        ? await tx.productModel.deleteMany({ where: { id: { notIn: keepModelIds } } })
        : await tx.productModel.deleteMany();
      const clients = keepClientIds.length
        ? await tx.client.deleteMany({ where: { id: { notIn: keepClientIds } } })
        : await tx.client.deleteMany();

      const [users, roles, depts, audit, archivedOrderCount, archivedModelCount, archivedMaterialCount] =
        await Promise.all([
          tx.user.count(),
          tx.role.count(),
          tx.department.count(),
          tx.auditLog.count(),
          tx.order.count(),
          tx.productModel.count(),
          tx.material.count({ where: { archivedAt: { not: null } } }),
        ]);

      return {
        deleted: { notifications, tasks, planLines, plans, materials, orders, models, clients },
        remaining: { users, roles, depts, audit, archivedOrderCount, archivedModelCount, archivedMaterialCount },
      };
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  const d = result.deleted;
  console.log(
    `  removed: ${d.orders.count} orders, ${d.models.count} models, ${d.clients.count} clients, ${d.materials.count} materials, ${d.tasks.count} tasks, ${d.plans.count} plans, ${d.notifications.count} notifications`,
  );
  const r = result.remaining;
  console.log(
    `  ✓ Done. Remaining: ${r.users} users, ${r.roles} roles, ${r.depts} departments, ${r.audit} audit logs, ${r.archivedOrderCount} archived orders, ${r.archivedModelCount} archived models, ${r.archivedMaterialCount} archived materials`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
