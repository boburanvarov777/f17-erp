import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { notFound } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';

export class CreateClientDto {
  @ApiProperty() @IsString() @MinLength(2) code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
export class UpdateClientDto extends PartialType(CreateClientDto) {}

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  @Get()
  @RequirePermissions('clients.read', 'orders.read')
  findAll(@Query('search') search?: string) {
    return this.prisma.client.findMany({
      where: {
        deletedAt: null,
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { orders: true, models: true } } },
    });
  }

  @Post()
  @RequirePermissions('clients.create', 'orders.create')
  async create(@Body() dto: CreateClientDto, @CurrentUser() actor: JwtUser) {
    const code = dto.code.trim().toUpperCase();
    // A deleted client (kept only for old orders) must not block reusing its code.
    const old = await this.prisma.client.findUnique({ where: { code }, select: { id: true, deletedAt: true } });
    if (old?.deletedAt) {
      await this.prisma.client.update({ where: { id: old.id }, data: { code: `${code}~DEL-${old.id.slice(-6)}` } });
    }
    const c = await this.prisma.client.create({ data: { ...dto, code } });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_CREATED', entity: 'Client', entityId: c.id, newValue: c });
    await this.notifications.broadcast({
      type: 'CLIENT_CREATED',
      title: `Yangi mijoz: ${c.name}`,
      body: c.code + (c.phone ? ` · ${c.phone}` : ''),
      link: '/orders',
    });
    return c;
  }

  @Patch(':id')
  @RequirePermissions('clients.update', 'orders.update')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: JwtUser) {
    const c = await this.prisma.client.update({ where: { id }, data: dto });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_UPDATED', entity: 'Client', entityId: id, newValue: c });
    return c;
  }

  /** What a delete would affect — shown in the confirm dialog. */
  @Get(':id/usage')
  @RequirePermissions('clients.read', 'orders.read')
  async usage(@Param('id') id: string) {
    const [orders, models] = await Promise.all([
      this.prisma.order.count({ where: { clientId: id } }),
      this.prisma.productModel.count({ where: { clientId: id } }),
    ]);
    return { orders, models };
  }

  /**
   * Unused client → removed from the database. Client with orders/models → hidden
   * from every list and picker (deletedAt) but kept, so those orders and models
   * still show who the client was.
   */
  @Delete(':id')
  @RequirePermissions('clients.delete', 'orders.purge')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client || client.deletedAt) throw notFound('err_record_not_found');
    const [orders, models] = await Promise.all([
      this.prisma.order.count({ where: { clientId: id } }),
      this.prisma.productModel.count({ where: { clientId: id } }),
    ]);
    const snapshot = { code: client.code, name: client.name, phone: client.phone, orders, models };
    if (orders + models === 0) {
      await this.prisma.client.delete({ where: { id } });
      this.audit.log({ userId: actor.sub, action: 'CLIENT_DELETED', entity: 'Client', entityId: id, oldValue: snapshot });
      return { success: true, mode: 'deleted', orders, models };
    }
    await this.prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_DELETED', entity: 'Client', entityId: id, oldValue: snapshot, newValue: { keptForHistory: true } });
    return { success: true, mode: 'hidden', orders, models };
  }
}

@Module({ imports: [NotificationsModule], controllers: [ClientsController] })
export class ClientsModule {}
