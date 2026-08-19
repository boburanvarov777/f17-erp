import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, StageType } from '@prisma/client';
import { JwtUser } from '../../common/decorators';
import { paginate } from '../../common/dto/pagination.dto';
import { badRequest } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildOrderBy, dateRange } from '../../common/utils/order-by';
import { EventsGateway } from '../../realtime/events.gateway';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto, QueryOrdersDto, UpdateOrderDto } from './dto';

export const STAGE_ORDER: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

const SORTABLE = ['number', 'qty', 'orderDate', 'deadline', 'status', 'priority', 'createdAt'];

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private events: EventsGateway,
    private notifications: NotificationsService,
  ) {}

  async findAll(dto: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = dto.archived === 'true' ? {} : { archivedAt: null };
    if (dto.status) where.status = dto.status;
    if (dto.priority) where.priority = dto.priority;
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.modelId) where.modelId = dto.modelId;
    if (dto.responsibleId) where.responsibleId = dto.responsibleId;
    const deadline = dateRange(dto.from, dto.to);
    if (deadline) where.deadline = deadline;
    if (dto.search) {
      where.OR = [
        { number: { contains: dto.search, mode: 'insensitive' } },
        { note: { contains: dto.search, mode: 'insensitive' } },
        { model: { code: { contains: dto.search, mode: 'insensitive' } } },
        { model: { name: { contains: dto.search, mode: 'insensitive' } } },
        { client: { name: { contains: dto.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, skip: dto.skip, take: dto.limit,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { deadline: 'asc' }) as any,
        include: {
          client: { select: { id: true, name: true, code: true } },
          model: { select: { id: true, code: true, name: true, photo: true } },
          responsible: { select: { id: true, firstName: true, lastName: true } },
          stages: { select: { stage: true, planQty: true, doneQty: true, defectQty: true, status: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(items.map((o) => this.withProgress(o)), total, dto);
  }

  withProgress<T extends { qty: number; stages: { stage: StageType; doneQty: number; defectQty: number }[]; deadline: Date; status: OrderStatus }>(order: T) {
    const loading = order.stages.find((s) => s.stage === 'LOADING');
    const done = loading?.doneQty ?? 0;
    const totalDone = order.stages.reduce((a, s) => a + s.doneQty, 0);
    const progress = order.qty > 0 ? Math.round((totalDone / (order.qty * STAGE_ORDER.length)) * 100) : 0;
    // Named defectQty so it never shadows the `defects` relation loaded by findOne().
    const defectQty = order.stages.reduce((a, s) => a + s.defectQty, 0);
    const isLate = order.deadline < new Date() && !['COMPLETED', 'CANCELLED'].includes(order.status);
    return { ...order, completedQty: done, remainingQty: Math.max(0, order.qty - done), progress, defectQty, isLate };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirstOrThrow({
      where: { OR: [{ id }, { number: id }] },
      include: {
        client: true,
        model: { include: { sizes: true, colors: true, accessories: true } },
        responsible: { select: { id: true, firstName: true, lastName: true, position: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        sizes: true,
        stages: {
          orderBy: { stage: 'asc' },
          include: {
            responsible: { select: { id: true, firstName: true, lastName: true } },
            entries: {
              orderBy: { createdAt: 'desc' }, take: 30,
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
        defects: { orderBy: { date: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } },
        shipments: { orderBy: { createdAt: 'desc' } },
        comments: { orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true, avatar: true } } } },
      },
    });
    const sorted = { ...order, stages: STAGE_ORDER.map((s) => order.stages.find((x) => x.stage === s)).filter(Boolean) as typeof order.stages };
    return this.withProgress(sorted as any);
  }

  /** Creates the order and its 6 production stages in a single transaction. */
  async create(dto: CreateOrderDto, actor: JwtUser) {
    const sizesTotal = (dto.sizes ?? []).reduce((a, s) => a + s.qty, 0);
    if (dto.sizes?.length && sizesTotal !== dto.qty) {
      throw badRequest('err_sizes_mismatch', { sizes: sizesTotal, qty: dto.qty });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          number: dto.number.trim().toUpperCase(),
          qty: dto.qty,
          orderDate: new Date(dto.orderDate),
          deadline: new Date(dto.deadline),
          priority: dto.priority ?? 'NORMAL',
          status: dto.status ?? 'NEW',
          note: dto.note,
          client: dto.clientId ? { connect: { id: dto.clientId } } : undefined,
          model: dto.modelId ? { connect: { id: dto.modelId } } : undefined,
          responsible: dto.responsibleId ? { connect: { id: dto.responsibleId } } : undefined,
          createdBy: { connect: { id: actor.sub } },
          sampleStatus: dto.sampleStatus,
          sampleSentAt: dto.sampleSentAt ? new Date(dto.sampleSentAt) : undefined,
          sampleApprovedAt: dto.sampleApprovedAt ? new Date(dto.sampleApprovedAt) : undefined,
          sampleNote: dto.sampleNote,
          sizes: dto.sizes?.length ? { create: dto.sizes } : undefined,
        },
      });
      await tx.orderStage.createMany({
        data: STAGE_ORDER.map((stage) => ({
          orderId: created.id,
          stage,
          planQty: dto.qty,
          status: stage === 'CUTTING' ? 'WAITING' : 'NOT_STARTED',
        })),
      });
      return created;
    });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ORDER_CREATED, entity: 'Order', entityId: order.id, newValue: { number: order.number, qty: order.qty } });
    this.events.emitAll('order:created', { id: order.id, number: order.number });
    await this.notifications.broadcast({
      type: 'ORDER_CREATED',
      title: `Yangi zakaz: ${order.number}`,
      body: `${order.qty} dona · deadline ${order.deadline.toISOString().slice(0, 10)}`,
      link: `/orders/${order.id}`,
    });
    return this.findOne(order.id);
  }

  async update(id: string, dto: UpdateOrderDto, actor: JwtUser) {
    const existing = await this.prisma.order.findUniqueOrThrow({ where: { id } });

    const order = await this.prisma.$transaction(async (tx) => {
      if (dto.sizes) {
        await tx.orderSize.deleteMany({ where: { orderId: id } });
        if (dto.sizes.length) await tx.orderSize.createMany({ data: dto.sizes.map((s) => ({ ...s, orderId: id })) });
      }
      if (dto.qty && dto.qty !== existing.qty) {
        await tx.orderStage.updateMany({ where: { orderId: id }, data: { planQty: dto.qty } });
      }
      return tx.order.update({
        where: { id },
        data: {
          ...(dto.number ? { number: dto.number.trim().toUpperCase() } : {}),
          qty: dto.qty,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          priority: dto.priority,
          status: dto.status,
          note: dto.note,
          sampleStatus: dto.sampleStatus,
          sampleSentAt: dto.sampleSentAt ? new Date(dto.sampleSentAt) : undefined,
          sampleApprovedAt: dto.sampleApprovedAt ? new Date(dto.sampleApprovedAt) : undefined,
          sampleNote: dto.sampleNote,
          ...(dto.clientId !== undefined ? { client: dto.clientId ? { connect: { id: dto.clientId } } : { disconnect: true } } : {}),
          ...(dto.modelId !== undefined ? { model: dto.modelId ? { connect: { id: dto.modelId } } : { disconnect: true } } : {}),
          ...(dto.responsibleId !== undefined ? { responsible: dto.responsibleId ? { connect: { id: dto.responsibleId } } : { disconnect: true } } : {}),
        },
      });
    });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ORDER_UPDATED, entity: 'Order', entityId: id, oldValue: { status: existing.status, qty: existing.qty, deadline: existing.deadline }, newValue: dto });
    this.events.emitAll('order:updated', { id, number: existing.number });
    return this.findOne(id);
  }

  async cancel(id: string, actor: JwtUser) {
    const order = await this.prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ORDER_CANCELLED, entity: 'Order', entityId: id });
    this.events.emitAll('order:updated', { id, number: order.number });
    return { success: true };
  }

  async archive(id: string, actor: JwtUser) {
    const order = await this.prisma.order.update({ where: { id }, data: { archivedAt: new Date() } });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ORDER_ARCHIVED, entity: 'Order', entityId: id });
    this.events.emitAll('order:updated', { id, number: order.number });
    return { success: true };
  }

  async restore(id: string, actor: JwtUser) {
    await this.prisma.order.update({ where: { id }, data: { archivedAt: null } });
    this.audit.log({ userId: actor.sub, action: 'ORDER_RESTORED', entity: 'Order', entityId: id });
    return { success: true };
  }

  async addComment(id: string, text: string, actor: JwtUser) {
    return this.prisma.orderComment.create({
      data: { orderId: id, userId: actor.sub, text },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
    });
  }

  /** Order-level history assembled from stage entries, defects and audit records. */
  async history(id: string) {
    const [entries, defects, logs] = await Promise.all([
      this.prisma.stageEntry.findMany({
        where: { orderStage: { orderId: id } },
        include: { orderStage: { select: { stage: true } }, user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' }, take: 200,
      }),
      this.prisma.defect.findMany({
        where: { orderId: id }, include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { date: 'desc' }, take: 200,
      }),
      this.prisma.auditLog.findMany({
        where: { entity: 'Order', entityId: id },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' }, take: 200,
      }),
    ]);

    const rows = [
      ...entries.map((e) => ({
        at: e.createdAt, kind: 'STAGE_ENTRY', stage: e.orderStage.stage,
        text: `${e.orderStage.stage}: +${e.qty} dona${e.defectQty ? `, brak +${e.defectQty}` : ''}${e.cancelled ? ' (bekor qilingan)' : ''}`,
        user: e.user ? `${e.user.lastName} ${e.user.firstName}` : null, source: e.source,
      })),
      ...defects.map((d) => ({
        at: d.date, kind: 'DEFECT', stage: d.stage,
        text: `Brak: ${d.type} +${d.qty}${d.reason ? ` (${d.reason})` : ''}`,
        user: d.user ? `${d.user.lastName} ${d.user.firstName}` : null, source: 'WEB',
      })),
      ...logs.map((l) => ({
        at: l.createdAt, kind: 'AUDIT', stage: null,
        text: l.action, user: l.user ? `${l.user.lastName} ${l.user.firstName}` : null, source: 'WEB',
      })),
    ];
    return rows.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 300);
  }

  /** Gantt / schedule feed for the Grafik module. */
  async schedule(from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = { archivedAt: null, status: { notIn: ['CANCELLED'] } };
    const range = dateRange(from, to);
    if (range) where.deadline = range;
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        model: { select: { code: true, name: true } },
        client: { select: { name: true } },
        responsible: { select: { firstName: true, lastName: true } },
        stages: { orderBy: { stage: 'asc' } },
      },
      orderBy: { deadline: 'asc' }, take: 300,
    });

    return orders.map((o) => {
      const start = o.orderDate;
      const end = o.deadline;
      const span = Math.max(1, Math.ceil((+end - +start) / 864e5));
      const per = span / STAGE_ORDER.length;
      return {
        id: o.id, number: o.number, qty: o.qty, status: o.status, priority: o.priority,
        client: o.client?.name, model: o.model ? `${o.model.code} — ${o.model.name}` : null,
        responsible: o.responsible ? `${o.responsible.lastName} ${o.responsible.firstName}` : null,
        start, end,
        bars: STAGE_ORDER.map((stage, i) => {
          const s = o.stages.find((x) => x.stage === stage);
          const barStart = s?.startDate ?? new Date(+start + i * per * 864e5);
          const barEnd = s?.endDate ?? new Date(+start + (i + 1) * per * 864e5);
          return {
            stage,
            start: barStart, end: barEnd,
            planQty: s?.planQty ?? o.qty, doneQty: s?.doneQty ?? 0,
            status: s?.status ?? 'NOT_STARTED',
            progress: s && s.planQty > 0 ? Math.round((s.doneQty / s.planQty) * 100) : 0,
          };
        }),
      };
    });
  }
}
