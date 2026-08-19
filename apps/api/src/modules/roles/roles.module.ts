import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { badRequest } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  SUPER_PRO_ADMIN_ROLE,
  assertSuperProAdmin,
  isSuperProAdmin,
} from '../../common/permissions';
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
  availablePermissions(@CurrentUser() actor: JwtUser) {
    assertSuperProAdmin(actor);
    const groups: Record<string, string[]> = {};
    for (const p of PERMISSIONS) {
      const [group] = p.split('.');
      (groups[group] ??= []).push(p);
    }
    return { all: PERMISSIONS, groups };
  }

  /** Role picker for user forms — excludes Super Pro Admin unless actor is one. */
  @Get('assignable')
  @RequirePermissions('users.read', 'users.create', 'users.update')
  async assignable(@CurrentUser() actor: JwtUser) {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });
    if (isSuperProAdmin(actor)) return roles;
    return roles.filter((r) => r.code !== SUPER_PRO_ADMIN_ROLE);
  }

  @Get()
  async findAll(@CurrentUser() actor: JwtUser, @Query('search') search?: string) {
    assertSuperProAdmin(actor);
    const roles = await this.prisma.role.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles;
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    assertSuperProAdmin(actor);
    return this.prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
  }

  @Post()
  async create(@Body() dto: CreateRoleDto, @CurrentUser() actor: JwtUser) {
    assertSuperProAdmin(actor);
    this.assertPermissions(dto.permissions);
    const role = await this.prisma.role.create({
      data: { code: dto.code.trim().toUpperCase(), name: dto.name, description: dto.description, permissions: dto.permissions },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ROLE_CREATED, entity: 'Role', entityId: role.id, newValue: role });
    return role;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: JwtUser) {
    assertSuperProAdmin(actor);
    const existing = await this.prisma.role.findUniqueOrThrow({ where: { id } });
    if (existing.code === SUPER_PRO_ADMIN_ROLE) {
      throw badRequest('err_super_pro_role_locked');
    }
    if (dto.permissions) this.assertPermissions(dto.permissions);
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
      },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ROLE_UPDATED, entity: 'Role', entityId: id, oldValue: existing, newValue: role });
    return role;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    assertSuperProAdmin(actor);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw badRequest('err_system_role_delete');
    if (role._count.users > 0) throw badRequest('err_role_has_users', { n: role._count.users });
    await this.prisma.role.delete({ where: { id } });
    this.audit.log({ userId: actor.sub, action: 'ROLE_DELETED', entity: 'Role', entityId: id, oldValue: role });
    return { success: true };
  }

  private assertPermissions(perms: string[]) {
    if (perms.includes(ALL_PERMISSIONS)) return;
    const invalid = perms.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (invalid.length) throw badRequest('err_unknown_permissions', { items: invalid.join(', ') });
  }
}

@Module({ controllers: [RolesController] })
export class RolesModule {}
