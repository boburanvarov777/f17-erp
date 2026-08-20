import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser, JwtUser } from '../../common/decorators';
import { badRequest, notFound } from '../../common/i18n/api-errors';
import { assertTopAdmin, isSuperProAdmin, SUPER_PRO_ADMIN_ROLE } from '../../common/permissions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Modules that expose archive — keep in sync with users/orders/models/warehouse controllers. */
export const ARCHIVE_MODULE_KEYS = ['users', 'orders', 'models', 'materials'] as const;
export type ArchiveModuleKey = (typeof ARCHIVE_MODULE_KEYS)[number];

const MODULE_LABELS: Record<ArchiveModuleKey, string> = {
  users: 'nav_users',
  orders: 'nav_orders',
  models: 'nav_models',
  materials: 'warehouse_title',
};

class RestoreArchiveDto {
  @ApiProperty({ enum: ['user', 'order', 'model', 'material'] })
  @IsEnum(['user', 'order', 'model', 'material'])
  type!: 'user' | 'order' | 'model' | 'material';

  @ApiProperty()
  @IsString()
  id!: string;
}

@Injectable()
export class ArchiveService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertAccess(actor: JwtUser): void {
    assertTopAdmin(actor);
  }

  private userArchiveWhere(actor: JwtUser, departmentId?: string) {
    const where: Record<string, unknown> = { archivedAt: { not: null } };
    if (departmentId) where.departmentId = departmentId;
    if (!isSuperProAdmin(actor)) where.role = { code: { not: SUPER_PRO_ADMIN_ROLE } };
    return where;
  }

  async modules(actor: JwtUser) {
    this.assertAccess(actor);
    const userWhere = this.userArchiveWhere(actor);
    const [users, orders, models, materials] = await Promise.all([
      this.prisma.user.count({ where: userWhere as any }),
      this.prisma.order.count({ where: { archivedAt: { not: null } } }),
      this.prisma.productModel.count({
        where: { OR: [{ archivedAt: { not: null } }, { status: 'ARCHIVED' }] },
      }),
      this.prisma.material.count({ where: { archivedAt: { not: null } } }),
    ]);
    const counts: Record<ArchiveModuleKey, number> = { users, orders, models, materials };
    return ARCHIVE_MODULE_KEYS.map((key) => ({
      key,
      labelKey: MODULE_LABELS[key],
      count: counts[key],
    }));
  }

  /** Department sub-tabs — only for archived users. */
  async departments(actor: JwtUser, module: ArchiveModuleKey) {
    this.assertAccess(actor);
    if (module !== 'users') return [];

    const depts = await this.prisma.department.findMany({ orderBy: { nameUz: 'asc' } });
    const counts = await Promise.all(
      depts.map((d) =>
        this.prisma.user.count({ where: this.userArchiveWhere(actor, d.id) as any }),
      ),
    );
    return depts.map((d, i) => ({
      id: d.id,
      code: d.code,
      nameUz: d.nameUz,
      nameRu: d.nameRu,
      nameEn: d.nameEn,
      stage: d.stage,
      total: counts[i],
    }));
  }

  async list(module: ArchiveModuleKey, actor: JwtUser, departmentId?: string) {
    this.assertAccess(actor);
    if (!ARCHIVE_MODULE_KEYS.includes(module)) throw badRequest('err_archive_unknown_type');

    switch (module) {
      case 'users': {
        const users = await this.prisma.user.findMany({
          where: this.userArchiveWhere(actor, departmentId) as any,
          orderBy: { archivedAt: 'desc' },
          take: 100,
          select: {
            id: true, firstName: true, lastName: true, login: true, phone: true, position: true,
            archivedAt: true, status: true,
            department: { select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true } },
            role: { select: { code: true, name: true } },
          },
        });
        return { module, users, orders: [], models: [], materials: [], counts: { users: users.length } };
      }
      case 'orders': {
        const orders = await this.prisma.order.findMany({
          where: { archivedAt: { not: null } },
          orderBy: { archivedAt: 'desc' },
          take: 100,
          select: {
            id: true, number: true, qty: true, status: true, archivedAt: true,
            client: { select: { name: true, code: true } },
            model: { select: { code: true, name: true } },
          },
        });
        return { module, users: [], orders, models: [], materials: [], counts: { orders: orders.length } };
      }
      case 'models': {
        const models = await this.prisma.productModel.findMany({
          where: { OR: [{ archivedAt: { not: null } }, { status: 'ARCHIVED' }] },
          orderBy: { archivedAt: 'desc' },
          take: 100,
          select: {
            id: true, code: true, name: true, category: true, status: true, archivedAt: true,
            client: { select: { name: true, code: true } },
          },
        });
        return { module, users: [], orders: [], models, materials: [], counts: { models: models.length } };
      }
      case 'materials': {
        const materials = await this.prisma.material.findMany({
          where: { archivedAt: { not: null } },
          orderBy: { archivedAt: 'desc' },
          take: 100,
          select: {
            id: true, code: true, name: true, category: true, unit: true, stock: true, archivedAt: true,
          },
        });
        return { module, users: [], orders: [], models: [], materials, counts: { materials: materials.length } };
      }
    }
  }

  async restore(dto: RestoreArchiveDto, actor: JwtUser) {
    this.assertAccess(actor);
    switch (dto.type) {
      case 'user': {
        const user = await this.prisma.user.findUnique({ where: { id: dto.id }, include: { role: true } });
        if (!user?.archivedAt) throw badRequest('err_user_not_found');
        if (!isSuperProAdmin(actor) && user.role.code === SUPER_PRO_ADMIN_ROLE) {
          throw badRequest('err_user_not_found');
        }
        await this.prisma.user.update({
          where: { id: dto.id },
          data: { status: 'ACTIVE', archivedAt: null },
        });
        await this.prisma.refreshToken.updateMany({
          where: { userId: dto.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.audit.log({ userId: actor.sub, action: 'USER_RESTORED', entity: 'User', entityId: dto.id });
        return { success: true };
      }
      case 'order': {
        const order = await this.prisma.order.findFirst({ where: { id: dto.id, archivedAt: { not: null } } });
        if (!order) throw notFound('err_record_not_found');
        await this.prisma.order.update({ where: { id: dto.id }, data: { archivedAt: null } });
        this.audit.log({ userId: actor.sub, action: 'ORDER_RESTORED', entity: 'Order', entityId: dto.id });
        return { success: true };
      }
      case 'model': {
        const model = await this.prisma.productModel.findFirst({
          where: {
            id: dto.id,
            OR: [{ archivedAt: { not: null } }, { status: 'ARCHIVED' }],
          },
        });
        if (!model) throw notFound('err_record_not_found');
        await this.prisma.productModel.update({
          where: { id: dto.id },
          data: { archivedAt: null, status: 'ACTIVE' },
        });
        this.audit.log({ userId: actor.sub, action: 'MODEL_RESTORED', entity: 'ProductModel', entityId: dto.id });
        return { success: true };
      }
      case 'material': {
        const material = await this.prisma.material.findFirst({ where: { id: dto.id, archivedAt: { not: null } } });
        if (!material) throw notFound('err_record_not_found');
        await this.prisma.material.update({ where: { id: dto.id }, data: { archivedAt: null } });
        this.audit.log({ userId: actor.sub, action: 'MATERIAL_RESTORED', entity: 'Material', entityId: dto.id });
        return { success: true };
      }
      default:
        throw badRequest('err_archive_unknown_type');
    }
  }
}

@ApiTags('archive')
@ApiBearerAuth()
@Controller('archive')
export class ArchiveController {
  constructor(private service: ArchiveService) {}

  @Get('modules')
  @ApiOperation({ summary: 'Archivable ERP modules with counts' })
  modules(@CurrentUser() actor: JwtUser) {
    return this.service.modules(actor);
  }

  @Get('departments')
  @ApiOperation({ summary: 'Department sub-tabs for archived users' })
  departments(
    @Query('module') module: ArchiveModuleKey,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.service.departments(actor, module ?? 'users');
  }

  @Get()
  @ApiOperation({ summary: 'Archived items for a module tab' })
  list(
    @Query('module') module: ArchiveModuleKey,
    @Query('departmentId') departmentId: string | undefined,
    @CurrentUser() actor: JwtUser,
  ) {
    if (!module || !ARCHIVE_MODULE_KEYS.includes(module)) throw badRequest('err_archive_unknown_type');
    return this.service.list(module, actor, departmentId);
  }

  @Post('restore')
  @ApiOperation({ summary: 'Restore archived user, order, model, or material' })
  restore(@Body() dto: RestoreArchiveDto, @CurrentUser() actor: JwtUser) {
    return this.service.restore(dto, actor);
  }
}

@Module({
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
