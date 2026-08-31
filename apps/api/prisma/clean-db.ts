/* eslint-disable no-console */
/**
 * Wipes all business / audit data. Keeps users, roles, departments only.
 * Run: npm run clean-db --workspace apps/api
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('▸ Cleaning database (keeping users, roles, departments)…');

  await prisma.$transaction([
    prisma.planLine.deleteMany(),
    prisma.plan.deleteMany(),
    prisma.task.deleteMany(),
    prisma.stockTransaction.deleteMany(),
    prisma.material.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.defect.deleteMany(),
    prisma.stageEntry.deleteMany(),
    prisma.orderStage.deleteMany(),
    prisma.orderComment.deleteMany(),
    prisma.orderSize.deleteMany(),
    prisma.order.deleteMany(),
    prisma.modelFile.deleteMany(),
    prisma.modelPhoto.deleteMany(),
    prisma.accessory.deleteMany(),
    prisma.modelColor.deleteMany(),
    prisma.modelSize.deleteMany(),
    prisma.productModel.deleteMany(),
    prisma.client.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.telegramSession.deleteMany(),
    prisma.setting.deleteMany(),
  ]);

  const [users, roles, depts] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.department.count(),
  ]);

  console.log(`  ✓ Done. Remaining: ${users} users, ${roles} roles, ${depts} departments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
