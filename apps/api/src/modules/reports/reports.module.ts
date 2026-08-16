import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateRange } from '../../common/utils/order-by';

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
    for (const e of entries) {
      const s = e.orderStage.stage;
      (byStage[s] ??= { stage: s, qty: 0, defect: 0, operations: 0 });
      byStage[s].qty += e.qty; byStage[s].defect += e.defectQty; byStage[s].operations++;
      const u = e.user ? `${e.user.lastName} ${e.user.firstName}` : 'Tizim';
      (byUser[u] ??= { user: u, qty: 0, defect: 0, operations: 0 });
      byUser[u].qty += e.qty; byUser[u].defect += e.defectQty; byUser[u].operations++;
    }
    return {
      totals: {
        qty: entries.reduce((a, e) => a + e.qty, 0),
        defect: entries.reduce((a, e) => a + e.defectQty, 0),
        operations: entries.length,
      },
      byStage: Object.values(byStage),
      byUser: Object.values(byUser).sort((a, b) => b.qty - a.qty).slice(0, 30),
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
  @ApiOperation({ summary: 'Production output by stage and by employee' })
  production(@Query('from') from?: string, @Query('to') to?: string) { return this.service.production(from, to); }

  @Get('orders') @RequirePermissions('reports.read')
  orders(@Query('from') from?: string, @Query('to') to?: string) { return this.service.orders(from, to); }

  @Get('defects') @RequirePermissions('reports.read')
  defects(@Query('from') from?: string, @Query('to') to?: string) { return this.service.defects(from, to); }

  @Get('warehouse') @RequirePermissions('reports.read')
  warehouse() { return this.service.warehouse(); }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
