import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

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
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  @RequirePermissions('clients.read', 'orders.read')
  findAll(@Query('search') search?: string) {
    return this.prisma.client.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : undefined,
      orderBy: { name: 'asc' },
      include: { _count: { select: { orders: true, models: true } } },
    });
  }

  @Post()
  @RequirePermissions('clients.create', 'orders.create')
  async create(@Body() dto: CreateClientDto, @CurrentUser() actor: JwtUser) {
    const c = await this.prisma.client.create({ data: { ...dto, code: dto.code.trim().toUpperCase() } });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_CREATED', entity: 'Client', entityId: c.id, newValue: c });
    return c;
  }

  @Patch(':id')
  @RequirePermissions('clients.update', 'orders.update')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: JwtUser) {
    const c = await this.prisma.client.update({ where: { id }, data: dto });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_UPDATED', entity: 'Client', entityId: id, newValue: c });
    return c;
  }

  @Delete(':id')
  @RequirePermissions('clients.delete')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    await this.prisma.client.delete({ where: { id } });
    this.audit.log({ userId: actor.sub, action: 'CLIENT_DELETED', entity: 'Client', entityId: id });
    return { success: true };
  }
}

@Module({ controllers: [ClientsController] })
export class ClientsModule {}
