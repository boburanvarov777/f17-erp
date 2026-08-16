import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductionModule } from '../production/production.module';
import { ProductionService } from '../production/production.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private production: ProductionService) {}

  async kpis() {
    const now = new Date();
    const [activeOrders, inProduction, lateOrders, readyOrders, defectAgg, doneAgg, totalOrders] = await Promise.all([
      this.prisma.order.count({ where: { archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      this.prisma.order.aggregate({ _sum: { qty: true }, where: { archivedAt: null, status: { in: ['IN_PRODUCTION', 'CONFIRMED', 'READY', 'LOADING'] } } }),
      this.prisma.order.count({ where: { archivedAt: null, deadline: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      this.prisma.order.count({ where: { archivedAt: null, status: { in: ['READY', 'LOADING'] } } }),
      this.prisma.orderStage.aggregate({ _sum: { defectQty: true, doneQty: true }, where: { order: { archivedAt: null } } }),
      this.prisma.orderStage.aggregate({ _sum: { doneQty: true }, where: { stage: 'LOADING', order: { archivedAt: null } } }),
      this.prisma.order.count({ where: { archivedAt: null } }),
    ]);

    const totalDone = defectAgg._sum.doneQty ?? 0;
    const totalDefect = defectAgg._sum.defectQty ?? 0;
    const defectRate = totalDone + totalDefect > 0 ? +((totalDefect / (totalDone + totalDefect)) * 100).toFixed(2) : 0;

    return {
      activeOrders,
      totalOrders,
      inProductionQty: inProduction._sum.qty ?? 0,
      lateOrders,
      readyToLoad: readyOrders,
      shippedQty: doneAgg._sum.doneQty ?? 0,
      defectQty: totalDefect,
      defectRate,
    };
  }

  stages() {
    return this.production.summary();
  }

  async recent(limit = 12) {
    const entries = await this.prisma.stageEntry.findMany({
      where: { cancelled: false },
      orderBy: { createdAt: 'desc' }, take: limit,
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
        orderStage: { select: { stage: true, planQty: true, doneQty: true, order: { select: { id: true, number: true, model: { select: { code: true } } } } } },
      },
    });
    return entries.map((e) => ({
      id: e.id, at: e.createdAt, qty: e.qty, defectQty: e.defectQty, source: e.source, note: e.note,
      stage: e.orderStage.stage,
      progress: e.orderStage.planQty ? Math.round((e.orderStage.doneQty / e.orderStage.planQty) * 100) : 0,
      order: e.orderStage.order,
      user: e.user ? `${e.user.lastName} ${e.user.firstName}` : 'Tizim',
    }));
  }

  async upcoming(limit = 10) {
    const orders = await this.prisma.order.findMany({
      where: { archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { deadline: 'asc' }, take: limit,
      include: {
        client: { select: { name: true } },
        model: { select: { code: true, name: true } },
        stages: { select: { stage: true, planQty: true, doneQty: true } },
      },
    });
    const now = Date.now();
    return orders.map((o) => {
      const totalDone = o.stages.reduce((a, s) => a + s.doneQty, 0);
      const totalPlan = o.stages.reduce((a, s) => a + s.planQty, 0);
      return {
        id: o.id, number: o.number, qty: o.qty, deadline: o.deadline, status: o.status, priority: o.priority,
        client: o.client?.name, model: o.model ? `${o.model.code} — ${o.model.name}` : null,
        daysLeft: Math.ceil((+o.deadline - now) / 864e5),
        isLate: +o.deadline < now,
        progress: totalPlan ? Math.round((totalDone / totalPlan) * 100) : 0,
      };
    });
  }

  /** 14-day production trend for the dashboard chart. */
  async trend(days = 14) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    const entries = await this.prisma.stageEntry.findMany({
      where: { date: { gte: from }, cancelled: false },
      select: { date: true, qty: true, defectQty: true, orderStage: { select: { stage: true } } },
    });
    const buckets: Record<string, { date: string; qty: number; defect: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(from); d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, qty: 0, defect: 0 };
    }
    for (const e of entries) {
      const key = e.date.toISOString().slice(0, 10);
      if (buckets[key]) { buckets[key].qty += e.qty; buckets[key].defect += e.defectQty; }
    }
    return Object.values(buckets);
  }

  async defectsByStage() {
    const grouped = await this.prisma.defect.groupBy({ by: ['stage'], _sum: { qty: true }, _count: { _all: true } });
    return grouped.map((g) => ({ stage: g.stage, qty: g._sum.qty ?? 0, count: g._count._all }));
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  async all() {
    const [kpis, stages, recent, upcoming, trend, defects] = await Promise.all([
      this.service.kpis(), this.service.stages(), this.service.recent(), this.service.upcoming(), this.service.trend(), this.service.defectsByStage(),
    ]);
    return { kpis, stages, recent, upcoming, trend, defects };
  }

  @Get('kpis') @RequirePermissions('dashboard.read')
  kpis() { return this.service.kpis(); }

  @Get('trend') @RequirePermissions('dashboard.read')
  trend(@Query('days') days?: string) { return this.service.trend(days ? +days : 14); }
}

@Module({ imports: [ProductionModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
