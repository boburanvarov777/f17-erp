import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StageType } from '@prisma/client';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateRange } from '../../common/utils/order-by';
import { STAGE_SEQUENCE } from '../production/production.service';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface DailyOrderRow {
  orderId: string;
  number: string;
  model: string | null;
  modelName: string | null;
  client: string | null;
  orderStatus: string;
  stageStatus: string;
  planQty: number;
  doneQty: number;
  qty: number;
  defect: number;
  operations: number;
  users: string[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async production(from?: string, to?: string) {
    const range = dateRange(from, to);
    const entries = await this.prisma.stageEntry.findMany({
      where: { cancelled: false, ...(range ? { date: range } : {}) },
      include: {
        orderStage: { select: { stage: true, order: { select: { number: true, model: { select: { code: true } } } } } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const byStage: Record<string, { stage: string; qty: number; defect: number; operations: number }> = {};
    const byUser: Record<string, { user: string; qty: number; defect: number; operations: number }> = {};
    const byModel: Record<string, { model: string; qty: number; defect: number; operations: number }> = {};
    const byDay: Record<string, { date: string; qty: number; defect: number; operations: number }> = {};
    for (const e of entries) {
      const s = e.orderStage.stage;
      (byStage[s] ??= { stage: s, qty: 0, defect: 0, operations: 0 });
      byStage[s].qty += e.qty; byStage[s].defect += e.defectQty; byStage[s].operations++;
      const u = e.user ? `${e.user.lastName} ${e.user.firstName}` : 'Tizim';
      (byUser[u] ??= { user: u, qty: 0, defect: 0, operations: 0 });
      byUser[u].qty += e.qty; byUser[u].defect += e.defectQty; byUser[u].operations++;
      const m = e.orderStage.order.model?.code ?? '—';
      (byModel[m] ??= { model: m, qty: 0, defect: 0, operations: 0 });
      byModel[m].qty += e.qty; byModel[m].defect += e.defectQty; byModel[m].operations++;
      const d = dayKey(e.date);
      (byDay[d] ??= { date: d, qty: 0, defect: 0, operations: 0 });
      byDay[d].qty += e.qty; byDay[d].defect += e.defectQty; byDay[d].operations++;
    }
    return {
      totals: {
        qty: entries.reduce((a, e) => a + e.qty, 0),
        defect: entries.reduce((a, e) => a + e.defectQty, 0),
        operations: entries.length,
      },
      byStage: STAGE_SEQUENCE.filter((s) => byStage[s]).map((s) => byStage[s]),
      byUser: Object.values(byUser).sort((a, b) => b.qty - a.qty).slice(0, 30),
      byModel: Object.values(byModel).sort((a, b) => b.qty - a.qty).slice(0, 15),
      daily: this.fillDays(byDay, from, to),
    };
  }

  /**
   * Keeps empty days in the series so the trend chart shows real gaps.
   * Days are walked in UTC to stay aligned with how entry dates are stored.
   */
  private fillDays(
    byDay: Record<string, { date: string; qty: number; defect: number; operations: number }>,
    from?: string,
    to?: string,
  ) {
    const keys = Object.keys(byDay).sort();
    const startKey = from?.slice(0, 10) ?? keys[0];
    const endKey = to?.slice(0, 10) ?? keys[keys.length - 1];
    if (!startKey || !endKey) return [];

    const cursor = new Date(`${startKey}T00:00:00.000Z`);
    const last = new Date(`${endKey}T00:00:00.000Z`);
    // Long ranges would make an unreadable chart, so fall back to recorded days only.
    if (Math.round((+last - +cursor) / 86_400_000) > 92) return keys.map((k) => byDay[k]);

    const out: { date: string; qty: number; defect: number; operations: number }[] = [];
    while (cursor <= last) {
      const key = dayKey(cursor);
      out.push(byDay[key] ?? { date: key, qty: 0, defect: 0, operations: 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  /**
   * One production day broken down per department: which orders and models were
   * worked on, how much was produced and where each stage stands.
   * `stage` narrows the result to a single department.
   */
  private async dayBuckets(key: string, stage?: StageType) {
    const start = new Date(`${key}T00:00:00.000Z`);
    const end = new Date(`${key}T23:59:59.999Z`);
    const range = { gte: start, lte: end };

    const [entries, defects] = await Promise.all([
      this.prisma.stageEntry.findMany({
        where: { cancelled: false, date: range, ...(stage ? { orderStage: { stage } } : {}) },
        orderBy: { date: 'asc' },
        include: {
          orderStage: {
            select: {
              stage: true, planQty: true, doneQty: true, status: true,
              order: {
                select: {
                  id: true, number: true, status: true,
                  model: { select: { code: true, name: true } },
                  client: { select: { name: true } },
                },
              },
            },
          },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.defect.findMany({
        where: { date: range, ...(stage ? { stage } : {}) },
        select: {
          stage: true, qty: true, type: true,
          order: {
            select: {
              id: true, number: true, status: true,
              model: { select: { code: true, name: true } },
              client: { select: { name: true } },
              stages: { select: { stage: true, planQty: true, doneQty: true, status: true } },
            },
          },
        },
      }),
    ]);

    const buckets = new Map<StageType, { qty: number; defect: number; operations: number; orders: Map<string, DailyOrderRow> }>();
    const bucket = (stage: StageType) => {
      let b = buckets.get(stage);
      if (!b) { b = { qty: 0, defect: 0, operations: 0, orders: new Map() }; buckets.set(stage, b); }
      return b;
    };

    for (const e of entries) {
      const st = e.orderStage.stage;
      const b = bucket(st);
      b.qty += e.qty; b.defect += e.defectQty; b.operations++;
      const o = e.orderStage.order;
      let row = b.orders.get(o.id);
      if (!row) {
        row = {
          orderId: o.id, number: o.number,
          model: o.model?.code ?? null, modelName: o.model?.name ?? null,
          client: o.client?.name ?? null,
          orderStatus: o.status, stageStatus: e.orderStage.status,
          planQty: e.orderStage.planQty, doneQty: e.orderStage.doneQty,
          qty: 0, defect: 0, operations: 0, users: [],
        };
        b.orders.set(o.id, row);
      }
      row.qty += e.qty; row.defect += e.defectQty; row.operations++;
      const u = e.user ? `${e.user.lastName} ${e.user.firstName}` : null;
      if (u && !row.users.includes(u)) row.users.push(u);
    }

    // Defects logged straight from QC have no stage entry, so add their own rows.
    for (const d of defects) {
      const b = bucket(d.stage);
      b.defect += d.qty;
      const o = d.order;
      let row = b.orders.get(o.id);
      if (!row) {
        const stage = o.stages.find((s) => s.stage === d.stage);
        row = {
          orderId: o.id, number: o.number,
          model: o.model?.code ?? null, modelName: o.model?.name ?? null,
          client: o.client?.name ?? null,
          orderStatus: o.status, stageStatus: stage?.status ?? 'WAITING',
          planQty: stage?.planQty ?? 0, doneQty: stage?.doneQty ?? 0,
          qty: 0, defect: 0, operations: 0, users: [],
        };
        b.orders.set(o.id, row);
      }
      row.defect += d.qty;
    }

    return STAGE_SEQUENCE.filter((s) => buckets.has(s)).map((s) => {
      const b = buckets.get(s)!;
      const orders = [...b.orders.values()].sort((a, x) => x.qty - a.qty);
      return { stage: s, qty: b.qty, defect: b.defect, operations: b.operations, orders };
    });
  }

  private dayTotals(byStage: { qty: number; defect: number; operations: number; orders: DailyOrderRow[] }[]) {
    const orderIds = new Set<string>();
    for (const s of byStage) for (const o of s.orders) orderIds.add(o.orderId);
    return {
      qty: byStage.reduce((a, s) => a + s.qty, 0),
      defect: byStage.reduce((a, s) => a + s.defect, 0),
      operations: byStage.reduce((a, s) => a + s.operations, 0),
      orders: orderIds.size,
    };
  }

  async daily(date?: string) {
    const key = (date || dayKey(new Date())).slice(0, 10);
    const byStage = await this.dayBuckets(key);
    return { date: key, totals: this.dayTotals(byStage), byStage };
  }

  /** Day of a single stage, as a trend series ending on `key`. */
  private async stageTrend(stage: StageType, key: string, days: number) {
    const end = new Date(`${key}T23:59:59.999Z`);
    const start = new Date(`${key}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const entries = await this.prisma.stageEntry.findMany({
      where: { cancelled: false, date: { gte: start, lte: end }, orderStage: { stage } },
      select: { date: true, qty: true, defectQty: true },
    });

    const byDay: Record<string, { date: string; qty: number; defect: number; operations: number }> = {};
    for (const e of entries) {
      const d = dayKey(e.date);
      (byDay[d] ??= { date: d, qty: 0, defect: 0, operations: 0 });
      byDay[d].qty += e.qty; byDay[d].defect += e.defectQty; byDay[d].operations++;
    }
    return this.fillDays(byDay, dayKey(start), key);
  }

  /**
   * The caller's own department for one day — shop-floor accounts get their
   * numbers without the factory-wide `reports.read` permission.
   */
  async myDepartment(actor: JwtUser, date?: string, days = 7) {
    const key = (date || dayKey(new Date())).slice(0, 10);
    const department = actor.departmentId
      ? await this.prisma.department.findUnique({
          where: { id: actor.departmentId },
          select: { code: true, nameUz: true, nameRu: true, nameEn: true, stage: true },
        })
      : null;
    const stage = department?.stage ?? null;

    if (!stage) {
      return {
        date: key, stage: null, department,
        totals: { qty: 0, defect: 0, operations: 0, orders: 0 },
        orders: [] as DailyOrderRow[], byModel: [], trend: [],
      };
    }

    const [byStage, trend] = await Promise.all([
      this.dayBuckets(key, stage),
      this.stageTrend(stage, key, days),
    ]);
    const orders = byStage[0]?.orders ?? [];

    const byModel: Record<string, { model: string; qty: number; defect: number; operations: number }> = {};
    for (const o of orders) {
      const m = o.model ?? '—';
      (byModel[m] ??= { model: m, qty: 0, defect: 0, operations: 0 });
      byModel[m].qty += o.qty; byModel[m].defect += o.defect; byModel[m].operations += o.operations;
    }

    return {
      date: key, stage, department,
      totals: this.dayTotals(byStage),
      orders,
      byModel: Object.values(byModel).sort((a, b) => b.qty - a.qty),
      trend,
    };
  }

  async orders(from?: string, to?: string) {
    const range = dateRange(from, to);
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: { archivedAt: null, ...(range ? { orderDate: range } : {}) },
      _count: { _all: true }, _sum: { qty: true },
    });
    return grouped.map((g) => ({ status: g.status, orders: g._count._all, qty: g._sum.qty ?? 0 }));
  }

  async defects(from?: string, to?: string) {
    const range = dateRange(from, to);
    const grouped = await this.prisma.defect.groupBy({
      by: ['stage', 'type'],
      where: range ? { date: range } : undefined,
      _sum: { qty: true }, _count: { _all: true },
    });
    return grouped.map((g) => ({ stage: g.stage, type: g.type, qty: g._sum.qty ?? 0, count: g._count._all }));
  }

  async warehouse() {
    const materials = await this.prisma.material.findMany({ where: { archivedAt: null } });
    return materials.map((m) => ({
      code: m.code, name: m.name, unit: m.unit,
      stock: Number(m.stock), reserved: Number(m.reserved),
      available: Number(m.stock) - Number(m.reserved),
      minStock: Number(m.minStock), status: m.status,
      value: m.price ? Number(m.price) * Number(m.stock) : null,
    }));
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('production')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Production output by day, stage, model and employee' })
  production(@Query('from') from?: string, @Query('to') to?: string) { return this.service.production(from, to); }

  @Get('daily')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'One day per department: orders, models, output and stage status' })
  daily(@Query('date') date?: string) { return this.service.daily(date); }

  @Get('my-department')
  @ApiOperation({ summary: "The caller's own department for one day, plus a short trend" })
  myDepartment(@CurrentUser() actor: JwtUser, @Query('date') date?: string, @Query('days') days?: string) {
    const window = Math.min(31, Math.max(1, parseInt(days || '7', 10) || 7));
    return this.service.myDepartment(actor, date, window);
  }

  @Get('orders') @RequirePermissions('reports.read')
  orders(@Query('from') from?: string, @Query('to') to?: string) { return this.service.orders(from, to); }

  @Get('defects') @RequirePermissions('reports.read')
  defects(@Query('from') from?: string, @Query('to') to?: string) { return this.service.defects(from, to); }

  @Get('warehouse') @RequirePermissions('reports.read')
  warehouse() { return this.service.warehouse(); }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
