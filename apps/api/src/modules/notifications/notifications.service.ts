import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../../realtime/events.gateway';

export interface NotificationInput {
  userId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private events: EventsGateway) {}

  async push(input: NotificationInput) {
    const n = await this.prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: (input.payload as any) ?? undefined,
      },
    });
    if (input.userId) this.events.emitUser(input.userId, 'notification', n);
    else this.events.emitAll('notification', n);
    return n;
  }

  /** System-wide notice (userId = null → visible to everyone). */
  broadcast(input: Omit<NotificationInput, 'userId'>) {
    return this.push(input);
  }

  async list(userId: string, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: { OR: [{ userId }, { userId: null }], ...(onlyUnread ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { OR: [{ userId }, { userId: null }], isRead: false } });
    return { count };
  }

  async markRead(id: string) {
    await this.prisma.notification.update({ where: { id }, data: { isRead: true } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { OR: [{ userId }, { userId: null }], isRead: false }, data: { isRead: true } });
    return { success: true };
  }
}
