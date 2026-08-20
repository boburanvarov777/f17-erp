import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN', LOGOUT: 'LOGOUT',
  USER_CREATED: 'USER_CREATED', USER_UPDATED: 'USER_UPDATED', USER_BLOCKED: 'USER_BLOCKED',
  USER_ARCHIVED: 'USER_ARCHIVED', USER_DELETED: 'USER_DELETED', PASSWORD_RESET: 'PASSWORD_RESET',
  ROLE_CHANGED: 'ROLE_CHANGED', ROLE_CREATED: 'ROLE_CREATED', ROLE_UPDATED: 'ROLE_UPDATED',
  DEPARTMENT_CHANGED: 'DEPARTMENT_CHANGED',
  ORDER_CREATED: 'ORDER_CREATED', ORDER_UPDATED: 'ORDER_UPDATED', ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_ARCHIVED: 'ORDER_ARCHIVED',
  MODEL_CREATED: 'MODEL_CREATED', MODEL_UPDATED: 'MODEL_UPDATED', MODEL_ARCHIVED: 'MODEL_ARCHIVED',
  STAGE_UPDATED: 'STAGE_UPDATED', STAGE_ENTRY_ADDED: 'STAGE_ENTRY_ADDED', STAGE_ENTRY_CANCELLED: 'STAGE_ENTRY_CANCELLED',
  DEFECT_ADDED: 'DEFECT_ADDED',
  WAREHOUSE_IN: 'WAREHOUSE_IN', WAREHOUSE_OUT: 'WAREHOUSE_OUT', WAREHOUSE_RESERVE: 'WAREHOUSE_RESERVE',
  WAREHOUSE_RETURN: 'WAREHOUSE_RETURN', WAREHOUSE_INVENTORY: 'WAREHOUSE_INVENTORY',
  TASK_CREATED: 'TASK_CREATED', TASK_COMPLETED: 'TASK_COMPLETED', TASK_UPDATED: 'TASK_UPDATED',
  PLAN_UPDATED: 'PLAN_UPDATED',
  TELEGRAM_LINKED: 'TELEGRAM_LINKED',
  SHIPMENT_UPDATED: 'SHIPMENT_UPDATED',
} as const;

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  device?: string;
  /** Stored as @nickname — captured once per row, never backfilled from User. */
  telegramUsername?: string | null;
}

/** Normalise Telegram handle for audit snapshots (always @prefix when present). */
export function formatAuditTelegramUsername(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const handle = trimmed.replace(/^@+/, '');
  return handle ? `@${handle}` : null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Fire-and-forget: auditing must never break a business transaction. */
  log(input: AuditInput): void {
    void this.prisma.auditLog
      .create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          oldValue: (input.oldValue as any) ?? undefined,
          newValue: (input.newValue as any) ?? undefined,
          ip: input.ip,
          device: input.device,
          telegramUsername: input.telegramUsername ?? undefined,
        },
      })
      .catch((e) => this.logger.warn(`audit failed: ${e.message}`));
  }
}
