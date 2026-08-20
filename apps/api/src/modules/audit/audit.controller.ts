import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { CurrentUser, JwtUser } from '../../common/decorators';
import { forbidden } from '../../common/i18n/api-errors';
import { isSuperProAdmin } from '../../common/permissions';
import { dateRange } from '../../common/utils/order-by';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUser,
    @Query() dto: PaginationDto,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!isSuperProAdmin(user)) throw forbidden('err_audit_super_only');
    const where: any = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;
    const createdAt = dateRange(from, to);
    if (createdAt) where.createdAt = createdAt;
    if (dto.search) {
      where.OR = [
        { action: { contains: dto.search, mode: 'insensitive' } },
        { entity: { contains: dto.search, mode: 'insensitive' } },
        { entityId: { contains: dto.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, skip: dto.skip, take: dto.limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, login: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, dto);
  }

  @Get('actions')
  actions(@CurrentUser() user: JwtUser) {
    if (!isSuperProAdmin(user)) throw forbidden('err_audit_super_only');
    return Object.values(AUDIT_ACTIONS_LIST);
  }
}

const AUDIT_ACTIONS_LIST = [
  'LOGIN','LOGOUT','USER_CREATED','USER_UPDATED','USER_BLOCKED','USER_ARCHIVED','USER_DELETED','PASSWORD_RESET',
  'ROLE_CHANGED','ROLE_CREATED','ROLE_UPDATED','DEPARTMENT_CHANGED','ORDER_CREATED','ORDER_UPDATED',
  'ORDER_CANCELLED','ORDER_ARCHIVED','MODEL_CREATED','MODEL_UPDATED','MODEL_ARCHIVED','STAGE_UPDATED',
  'STAGE_ENTRY_ADDED','STAGE_ENTRY_CANCELLED','DEFECT_ADDED','WAREHOUSE_IN','WAREHOUSE_OUT',
  'WAREHOUSE_RESERVE','WAREHOUSE_RETURN','WAREHOUSE_INVENTORY','TASK_CREATED','TASK_COMPLETED',
  'TASK_UPDATED','PLAN_UPDATED','TELEGRAM_LINKED','SHIPMENT_UPDATED',
];
