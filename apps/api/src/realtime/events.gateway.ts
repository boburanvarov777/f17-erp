import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/**
 * Real-time push: production stage updates, notifications, dashboard deltas.
 * Clients join per-user and per-department rooms after JWT handshake.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true }, namespace: '/realtime' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(private jwt: JwtService) {}

  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers.authorization as string)?.replace('Bearer ', '');
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      client.data.user = payload;
      void client.join(`user:${payload.sub}`);
      if (payload.departmentId) void client.join(`dept:${payload.departmentId}`);
      void client.join('all');
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`disconnected ${client.id}`);
  }

  emitAll(event: string, payload: unknown): void {
    this.server?.to('all').emit(event, payload);
  }

  emitUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitDepartment(departmentId: string, event: string, payload: unknown): void {
    this.server?.to(`dept:${departmentId}`).emit(event, payload);
  }
}
