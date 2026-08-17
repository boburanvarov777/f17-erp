import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { StageType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, Public, RequirePermissions } from '../../common/decorators';
import { badRequest } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export class CreateDepartmentDto {
  @ApiProperty() @IsString() @MinLength(2) code!: string;
  @ApiProperty() @IsString() nameUz!: string;
  @ApiProperty() @IsString() nameRu!: string;
  @ApiProperty() @IsString() nameEn!: string;
  @ApiPropertyOptional({ enum: StageType }) @IsOptional() @IsEnum(StageType) stage?: StageType;
}
export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Public: the Mini App login screen needs the department list before authentication. */
  @Public()
  @Get('public')
  publicList() {
    return this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
      orderBy: { code: 'asc' },
    });
  }

  @ApiBearerAuth()
  @Get()
  @RequirePermissions('departments.read', 'users.read')
  findAll() {
    return this.prisma.department.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  @ApiBearerAuth()
  @Post()
  @RequirePermissions('departments.create')
  async create(@Body() dto: CreateDepartmentDto, @CurrentUser() actor: JwtUser) {
    const d = await this.prisma.department.create({ data: { ...dto, code: dto.code.trim().toUpperCase() } });
    this.audit.log({ userId: actor.sub, action: 'DEPARTMENT_CREATED', entity: 'Department', entityId: d.id, newValue: d });
    return d;
  }

  @ApiBearerAuth()
  @Patch(':id')
  @RequirePermissions('departments.update')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() actor: JwtUser) {
    const d = await this.prisma.department.update({ where: { id }, data: dto });
    this.audit.log({ userId: actor.sub, action: 'DEPARTMENT_UPDATED', entity: 'Department', entityId: id, newValue: d });
    return d;
  }

  @ApiBearerAuth()
  @Delete(':id')
  @RequirePermissions('departments.delete')
  async remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    const d = await this.prisma.department.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (d._count.users > 0) throw badRequest('err_dept_has_users', { n: d._count.users });
    await this.prisma.department.update({ where: { id }, data: { isActive: false } });
    this.audit.log({ userId: actor.sub, action: 'DEPARTMENT_ARCHIVED', entity: 'Department', entityId: id });
    return { success: true };
  }
}

@Module({ controllers: [DepartmentsController] })
export class DepartmentsModule {}
