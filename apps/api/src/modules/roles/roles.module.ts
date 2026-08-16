import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSIONS } from '../../common/permissions';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

export class CreateRoleDto {
  @ApiProperty() @IsString() @MinLength(2) code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [String] }) @IsArray() permissions!: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isSystem?: boolean;
}
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('permissions')
  @RequirePermissions('roles.read')
  availablePermissions() {
    const groups: Record<string, string[]> = {};
    for (const p of PERMISSIONS) {
      const [group] = p.split('.');
      (groups[group] ??= []).push(p);
    }
    return { all: PERMISSIONS, groups };
  }

  @Get()
  @RequirePermissions('roles.read')
  async findAll(@Query('search') search?: string) {
    const roles = await this.prisma.role.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles;
  }

  @Get(':id')
  @RequirePermissions('roles.read')
  findOne(@Param('id') id: string) {
    return this.prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  }

  @Post()
  @RequirePermissions('roles.create')
  async create(@Body() dto: CreateRoleDto, @CurrentUser() actor: JwtUser) {
    this.assertPermissions(dto.permissions, actor);
    const role = await this.prisma.role.create({
      data: { code: dto.code.trim().toUpperCase(), name: dto.name, description: dto.description, permissions: dto.permissions },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ROLE_CREATED, entity: 'Role', entityId: role.id, newValue: role });
    return role;
  }

  @Patch(':id')
  @RequirePermissions('roles.update')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: JwtUser) {
    const existing = await this.prisma.role.findUniqueOrThrow({ where: { id } });
    if (existing.isSystem && dto.permissions) throw new BadRequestException('Tizim rolining huquqlarini o‘zgartirib bo‘lmaydi');
    if (dto.permissions) this.assertPermissions(dto.permissions, actor);
    const role = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description, permissions: dto.permissions },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ROLE_UPDATED, entity: 'Role', entityId: id, oldValue: existing, newValue: role });
    return role;
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw new BadRequestException('Tizim rolini o‘chirib bo‘lmaydi');
    if (role._count.users > 0) throw new BadRequestException(`Bu rolda ${role._count.users} ta foydalanuvchi bor — avval ularni boshqa rolga o‘tkazing`);
    await this.prisma.role.delete({ where: { id } });
    this.audit.log({ userId: actor.sub, action: 'ROLE_DELETED', entity: 'Role', entityId: id, oldValue: role });
    return { success: true };
  }

  private assertPermissions(perms: string[], actor: JwtUser) {
    if (perms.includes('*') && !actor.permissions.includes('*')) {
      throw new BadRequestException('To‘liq huquqni faqat Super Pro Admin bera oladi');
    }
    const invalid = perms.filter((p) => p !== '*' && !(PERMISSIONS as readonly string[]).includes(p));
    if (invalid.length) throw new BadRequestException(`Noma'lum permission: ${invalid.join(', ')}`);
  }
}

@Module({ controllers: [RolesController] })
export class RolesModule {}
