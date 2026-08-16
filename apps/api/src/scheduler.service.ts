import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './common/prisma/prisma.service';
import { NotificationsService } from './modules/notifications/notifications.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Flags overdue orders and warns about deadlines inside 3 days. */
  @Cron(CronExpression.EVERY_HOUR)
  async deadlineWatch(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 864e5);

    const late = await this.prisma.order.findMany({
      where: { archivedAt: null, deadline: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED', 'DELAYED'] } },
      select: { id: true, number: true, deadline: true },
    });
    for (const o of late) {
      await this.prisma.order.update({ where: { id: o.id }, data: { status: 'DELAYED' } });
      await this.notifications.broadcast({
        type: 'ORDER_DELAYED',
        title: `Zakaz kechikdi: ${o.number}`,
        body: `Deadline: ${o.deadline.toISOString().slice(0, 10)}`,
        link: `/orders/${o.id}`,
      });
    }

    const upcoming = await this.prisma.order.findMany({
      where: { archivedAt: null, deadline: { gte: now, lte: soon }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { id: true, number: true, deadline: true },
    });
    for (const o of upcoming) {
      const exists = await this.prisma.notification.findFirst({
        where: { type: 'DEADLINE_SOON', link: `/orders/${o.id}`, createdAt: { gte: new Date(now.getTime() - 864e5) } },
      });
      if (exists) continue;
      await this.notifications.broadcast({
        type: 'DEADLINE_SOON',
        title: `Deadline yaqin: ${o.number}`,
        body: `${Math.ceil((+o.deadline - +now) / 864e5)} kun qoldi`,
        link: `/orders/${o.id}`,
      });
    }

    if (late.length || upcoming.length) {
      this.logger.log(`deadline watch: ${late.length} delayed, ${upcoming.length} upcoming`);
    }
  }

  /** Housekeeping: drop expired refresh tokens once a day. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupTokens(): Promise<void> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 864e5) } }] },
    });
    if (count) this.logger.log(`cleaned ${count} refresh tokens`);
  }
}
