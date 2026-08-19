import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../../common/decorators';
import { isSuperProAdmin, SUPER_PRO_ADMIN_ROLE } from '../../common/permissions';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Global search (Ctrl+K) across orders, models, clients, materials, employees' })
  async global(@Query('q') q: string, @CurrentUser() actor: JwtUser) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { orders: [], models: [], clients: [], materials: [], users: [] };
    const has = (p: string) => actor.permissions.includes('*') || actor.permissions.includes(p);
    const like = { contains: query, mode: 'insensitive' as const };

    const [orders, models, clients, materials, users] = await Promise.all([
      has('orders.read')
        ? this.prisma.order.findMany({
            where: { archivedAt: null, OR: [{ number: like }, { note: like }, { model: { code: like } }, { client: { name: like } }] },
            select: { id: true, number: true, qty: true, status: true, deadline: true, model: { select: { code: true, name: true } } },
            take: 6,
          })
        : [],
      has('models.read')
        ? this.prisma.productModel.findMany({
            where: { archivedAt: null, OR: [{ code: like }, { name: like }, { fabric: like }] },
            select: { id: true, code: true, name: true, category: true, photo: true }, take: 6,
          })
        : [],
      has('clients.read') || has('orders.read')
        ? this.prisma.client.findMany({ where: { OR: [{ name: like }, { code: like }] }, select: { id: true, code: true, name: true }, take: 4 })
        : [],
      has('warehouse.read')
        ? this.prisma.material.findMany({
            where: { archivedAt: null, OR: [{ code: like }, { name: like }] },
            select: { id: true, code: true, name: true, unit: true, stock: true }, take: 5,
          })
        : [],
      has('users.read')
        ? this.prisma.user.findMany({
            where: {
              archivedAt: null,
              ...(isSuperProAdmin(actor) ? {} : { role: { code: { not: SUPER_PRO_ADMIN_ROLE } } }),
              OR: [{ firstName: like }, { lastName: like }, { login: like }, { phone: { contains: query } }],
            },
            select: { id: true, firstName: true, lastName: true, position: true, avatar: true }, take: 5,
          })
        : [],
    ]);

    return {
      orders,
      models,
      clients,
      materials: materials.map((m) => ({ ...m, stock: Number(m.stock) })),
      users,
    };
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
