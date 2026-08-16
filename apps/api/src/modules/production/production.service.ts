import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StageStatus, StageType } from '@prisma/client';
import { JwtUser } from '../../common/decorators';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildOrderBy, dateRange } from '../../common/utils/order-by';
import { STAGE_PERMISSION_PREFIX } from '../../common/permissions';
import { EventsGateway } from '../../realtime/events.gateway';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDefectDto, CreateEntryDto, QueryStageDto, UpdateStageDto, UpsertShipmentDto } from './dto';

export const STAGE_SEQUENCE: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

export const STAGE_SLUGS: Record<string, StageType> = {
  cutting: 'CUTTING', kesim: 'CUTTING',
  sewing: 'SEWING', tikuv: 'SEWING',
  washing: 'WASHING', varka: 'WASHING',
  laser: 'LASER', lazer: 'LASER',
  packing: 'PACKING', upakovka: 'PACKING',
  loading: 'LOADING', ortish: 'LOADING',
};

const SORTABLE = ['doneQty', 'planQty', 'defectQty', 'status', 'updatedAt', 'deadline'];

@Injectable()
export class ProductionService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: EventsGateway,
    private notifications: NotificationsService,
  ) {}

  resolveStage(slug: string): StageType {
    const stage = STAGE_SLUGS[slug.toLowerCase()];
    if (!stage) throw new NotFoundException(`Noma'lum bosqich: ${slug}`);
    return stage;
  }

  /** Guards writes so a sewing operator cannot post cutting numbers. */
  assertStageAccess(stage: StageType, actor: JwtUser, action: 'read' | 'create' | 'update') {
    if (actor.permissions.includes('*')) return;
    const prefix = STAGE_PERMISSION_PREFIX[stage];
    if (!actor.permissions.includes(`${prefix}.${action}`)) {
      throw new ForbiddenException(`Bu bosqich uchun huquqingiz yo‘q: ${prefix}.${action}`);
    }
  }

  async list(stage: StageType, dto: QueryStageDto, actor: JwtUser) {
    this.assertStageAccess(stage, actor, 'read');
    const where: Prisma.OrderStageWhereInput = { stage, order: { archivedAt: null, status: { not: 'CANCELLED' } } };
    if (dto.status) where.status = dto.status;
    if (dto.orderId) where.orderId = dto.orderId;
    if (dto.responsibleId) where.responsibleId = dto.responsibleId;
    const range = dateRange(dto.from, dto.to);
    if (range) where.order = { ...(where.order as object), deadline: range };
    if (dto.search) {
      where.order = {
        ...(where.order as object),
        OR: [
          { number: { contains: dto.search, mode: 'insensitive' } },
          { model: { code: { contains: dto.search, mode: 'insensitive' } } },
          { model: { name: { contains: dto.search, mode: 'insensitive' } } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.orderStage.findMany({
        where, skip: dto.skip, take: dto.limit,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { updatedAt: 'desc' }) as any,
        include: {
          order: {
            select: {
              id: true, number: true, qty: true, deadline: true, status: true, priority: true,
              model: { select: { id: true, code: true, name: true, photo: true } },
              client: { select: { name: true } },
            },
          },
          responsible: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.orderStage.count({ where }),
    ]);

    return paginate(items.map((s) => this.decorate(s)), total, dto);
  }

  private decorate<T extends { planQty: number; doneQty: number; defectQty: number }>(s: T) {
    return {
      ...s,
      remainingQty: Math.max(0, s.planQty - s.doneQty),
      progress: s.planQty > 0 ? Math.min(100, Math.round((s.doneQty / s.planQty) * 100)) : 0,
      defectRate: s.doneQty + s.defectQty > 0 ? +((s.defectQty / (s.doneQty + s.defectQty)) * 100).toFixed(2) : 0,
    };
  }

  async detail(stage: StageType, orderId: string, actor: JwtUser) {
    this.assertStageAccess(stage, actor, 'read');
    const s = await this.prisma.orderStage.findFirstOrThrow({
      where: { stage, orderId },
      include: {
        order: { include: { model: true, client: true } },
        responsible: { select: { id: true, firstName: true, lastName: true } },
        entries: {
          orderBy: { date: 'desc' }, take: 100,
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    const defects = await this.prisma.defect.findMany({
      where: { orderId, stage }, orderBy: { date: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    return { ...this.decorate(s), defects };
  }

  /**
   * Records a production operation.
   * Runs in a transaction: stage counters, order status and the downstream stage
   * are all updated atomically, so a failure never leaves half-applied numbers.
   */
  async addEntry(stage: StageType, dto: CreateEntryDto, actor: JwtUser, source: 'WEB' | 'TELEGRAM' | 'MINIAPP' = 'WEB') {
    this.assertStageAccess(stage, actor, 'create');
    if (dto.qty === 0 && !dto.defectQty) throw new BadRequestException('Miqdor 0 bo‘lishi mumkin emas');

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.orderStage.findFirst({
        where: { stage, orderId: dto.orderId },
        include: { order: { select: { id: true, number: true, qty: true, status: true } } },
      });
      if (!current) throw new NotFoundException('Bu zakaz uchun bosqich topilmadi');

      // Material-flow rule: a stage can never overtake the stage feeding it.
      const idx = STAGE_SEQUENCE.indexOf(stage);
      if (idx > 0) {
        const prev = await tx.orderStage.findFirst({ where: { orderId: dto.orderId, stage: STAGE_SEQUENCE[idx - 1] } });
        const available = prev?.doneQty ?? 0;
        if (current.doneQty + dto.qty > available) {
          throw new BadRequestException(
            `${STAGE_SEQUENCE[idx - 1]} bosqichidan faqat ${available} dona kelgan. ` +
              `Hozir ${current.doneQty} dona qayd etilgan, ${dto.qty} dona qo‘shib bo‘lmaydi.`,
          );
        }
      }
      if (current.doneQty + dto.qty > current.planQty) {
        throw new BadRequestException(`Rejadan oshib ketdi: plan ${current.planQty}, mavjud ${current.doneQty}, qo‘shilmoqchi ${dto.qty}`);
      }

      const entry = await tx.stageEntry.create({
        data: {
          orderStageId: current.id,
          qty: dto.qty,
          defectQty: dto.defectQty ?? 0,
          date: dto.date ? new Date(dto.date) : new Date(),
          userId: actor.sub,
          note: dto.note,
          source,
          meta: (dto.meta as any) ?? undefined,
        },
      });

      const doneQty = current.doneQty + dto.qty;
      const defectQty = current.defectQty + (dto.defectQty ?? 0);
      const status: StageStatus = doneQty >= current.planQty ? 'COMPLETED' : 'IN_PROGRESS';

      const updated = await tx.orderStage.update({
        where: { id: current.id },
        data: {
          doneQty, defectQty, status,
          startDate: current.startDate ?? new Date(),
          endDate: status === 'COMPLETED' ? new Date() : null,
          responsibleId: current.responsibleId ?? actor.sub,
          ...(dto.meta ? { meta: { ...((current.meta as object) ?? {}), ...dto.meta } as any } : {}),
        },
      });

      // Open the next stage as soon as material becomes available.
      if (idx < STAGE_SEQUENCE.length - 1) {
        await tx.orderStage.updateMany({
          where: { orderId: dto.orderId, stage: STAGE_SEQUENCE[idx + 1], status: 'NOT_STARTED' },
          data: { status: 'WAITING' },
        });
      }

      // Order status follows the production chain.
      let orderStatus = current.order.status;
      if (orderStatus === 'NEW' || orderStatus === 'CONFIRMED') orderStatus = 'IN_PRODUCTION';
      if (stage === 'PACKING' && status === 'COMPLETED') orderStatus = 'READY';
      if (stage === 'LOADING' && doneQty > 0 && status !== 'COMPLETED') orderStatus = 'LOADING';
      if (stage === 'LOADING' && status === 'COMPLETED') orderStatus = 'COMPLETED';
      if (orderStatus !== current.order.status) {
        await tx.order.update({ where: { id: dto.orderId }, data: { status: orderStatus } });
      }

      return { entry, stage: updated, order: current.order, orderStatus };
    });

    this.audit.log({
      userId: actor.sub, action: AUDIT_ACTIONS.STAGE_ENTRY_ADDED, entity: 'OrderStage', entityId: result.stage.id,
      newValue: { stage, qty: dto.qty, defectQty: dto.defectQty ?? 0, source },
    });

    const payload = {
      orderId: dto.orderId, orderNumber: result.order.number, stage,
      doneQty: result.stage.doneQty, planQty: result.stage.planQty,
      progress: result.stage.planQty ? Math.round((result.stage.doneQty / result.stage.planQty) * 100) : 0,
      status: result.stage.status, by: actor.fullName, source, at: new Date(),
    };
    this.events.emitAll('production:updated', payload);
    this.events.emitAll('dashboard:refresh', { reason: 'production' });

    if (result.stage.status === 'COMPLETED') {
      await this.notifications.broadcast({
        type: 'STAGE_COMPLETED',
        title: `${result.order.number} — ${stage} yakunlandi`,
        body: `${result.stage.doneQty} / ${result.stage.planQty} dona`,
        link: `/orders/${dto.orderId}`,
      });
    }

    return { ...this.decorate(result.stage), entry: result.entry };
  }

  /** History is immutable: entries are reversed, never deleted. */
  async cancelEntry(entryId: string, actor: JwtUser) {
    const entry = await this.prisma.stageEntry.findUniqueOrThrow({
      where: { id: entryId }, include: { orderStage: true },
    });
    if (entry.cancelled) throw new BadRequestException('Bu operatsiya allaqachon bekor qilingan');
    this.assertStageAccess(entry.orderStage.stage, actor, 'update');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.stageEntry.update({ where: { id: entryId }, data: { cancelled: true } });
      await tx.stageEntry.create({
        data: {
          orderStageId: entry.orderStageId,
          qty: -entry.qty, defectQty: -entry.defectQty,
          userId: actor.sub, note: `Reversal of ${entryId}`, source: 'WEB', cancelled: true,
        },
      });
      const doneQty = Math.max(0, entry.orderStage.doneQty - entry.qty);
      const defectQty = Math.max(0, entry.orderStage.defectQty - entry.defectQty);
      return tx.orderStage.update({
        where: { id: entry.orderStageId },
        data: {
          doneQty, defectQty,
          status: doneQty === 0 ? 'WAITING' : doneQty >= entry.orderStage.planQty ? 'COMPLETED' : 'IN_PROGRESS',
          endDate: doneQty >= entry.orderStage.planQty ? new Date() : null,
        },
      });
    });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.STAGE_ENTRY_CANCELLED, entity: 'StageEntry', entityId: entryId, oldValue: entry });
    this.events.emitAll('production:updated', { orderId: updated.orderId, stage: updated.stage, doneQty: updated.doneQty });
    return this.decorate(updated);
  }

  async updateStage(stageId: string, dto: UpdateStageDto, actor: JwtUser) {
    const existing = await this.prisma.orderStage.findUniqueOrThrow({ where: { id: stageId } });
    this.assertStageAccess(existing.stage, actor, 'update');

    const updated = await this.prisma.orderStage.update({
      where: { id: stageId },
      data: {
        planQty: dto.planQty,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        ...(dto.responsibleId !== undefined
          ? { responsible: dto.responsibleId ? { connect: { id: dto.responsibleId } } : { disconnect: true } }
          : {}),
        ...(dto.meta ? { meta: { ...((existing.meta as object) ?? {}), ...dto.meta } as any } : {}),
      },
      include: { order: { select: { number: true } } },
    });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.STAGE_UPDATED, entity: 'OrderStage', entityId: stageId, oldValue: existing, newValue: dto });
    this.events.emitAll('production:updated', { orderId: updated.orderId, stage: updated.stage, doneQty: updated.doneQty });

    if (dto.responsibleId) {
      await this.notifications.push({
        userId: dto.responsibleId, type: 'STAGE_ASSIGNED',
        title: `Sizga bosqich biriktirildi: ${updated.stage}`,
        body: `Zakaz ${updated.order.number}`, link: `/production/${updated.stage.toLowerCase()}`,
      });
    }
    return this.decorate(updated);
  }

  async addDefect(dto: CreateDefectDto, actor: JwtUser) {
    this.assertStageAccess(dto.stage, actor, 'update');
    const defect = await this.prisma.$transaction(async (tx) => {
      const d = await tx.defect.create({
        data: {
          orderId: dto.orderId, stage: dto.stage, type: dto.type, qty: dto.qty,
          reason: dto.reason, comment: dto.comment, userId: actor.sub,
          date: dto.date ? new Date(dto.date) : new Date(),
        },
      });
      await tx.orderStage.updateMany({
        where: { orderId: dto.orderId, stage: dto.stage },
        data: { defectQty: { increment: dto.qty } },
      });
      return d;
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.DEFECT_ADDED, entity: 'Defect', entityId: defect.id, newValue: dto });
    this.events.emitAll('defect:added', defect);
    return defect;
  }

  /** Aggregate per-stage totals — powers the dashboard progress cards. */
  async summary() {
    const grouped = await this.prisma.orderStage.groupBy({
      by: ['stage'],
      where: { order: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } } },
      _sum: { planQty: true, doneQty: true, defectQty: true },
      _count: { _all: true },
    });

    return STAGE_SEQUENCE.map((stage) => {
      const g = grouped.find((x) => x.stage === stage);
      const plan = g?._sum.planQty ?? 0;
      const done = g?._sum.doneQty ?? 0;
      const defect = g?._sum.defectQty ?? 0;
      return {
        stage, plan, done, defect,
        remaining: Math.max(0, plan - done),
        progress: plan > 0 ? Math.round((done / plan) * 100) : 0,
        orders: g?._count._all ?? 0,
      };
    });
  }

  // ── Shipments (Ortish / Loading module) ──

  async shipments(orderId?: string) {
    return this.prisma.shipment.findMany({
      where: orderId ? { orderId } : undefined,
      include: {
        order: {
          select: {
            id: true, number: true, qty: true, deadline: true, status: true,
            client: { select: { name: true } }, model: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async upsertShipment(dto: UpsertShipmentDto, actor: JwtUser, id?: string) {
    this.assertStageAccess('LOADING', actor, id ? 'update' : 'create');
    const data = {
      vehicle: dto.vehicle, driver: dto.driver, driverPhone: dto.driverPhone,
      qty: dto.qty ?? 0, boxCount: dto.boxCount ?? 0,
      loadingDate: dto.loadingDate ? new Date(dto.loadingDate) : undefined,
      status: dto.status, document: dto.document, trackNo: dto.trackNo, note: dto.note,
    };
    const shipment = id
      ? await this.prisma.shipment.update({ where: { id }, data })
      : await this.prisma.shipment.create({ data: { ...data, orderId: dto.orderId } });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.SHIPMENT_UPDATED, entity: 'Shipment', entityId: shipment.id, newValue: dto });
    this.events.emitAll('shipment:updated', shipment);
    return shipment;
  }
}
