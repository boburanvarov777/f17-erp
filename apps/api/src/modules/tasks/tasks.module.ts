import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Prisma, StageType, TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateRange } from '../../common/utils/order-by';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';

export class CreateTaskDto {
  @ApiProperty() @IsString() @MinLength(2) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() date!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() finishedAt?: string;
  @ApiPropertyOptional({ enum: TaskStatus }) @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() qty?: number;
  @ApiPropertyOptional({ description: 'Defaults to the caller' }) @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional({ enum: StageType }) @IsOptional() @IsEnum(StageType) stage?: StageType;
}
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  private canSeeAll(actor: JwtUser) {
    return actor.permissions.includes('*') || actor.permissions.includes('tasks.delete') || actor.permissions.includes('users.read');
  }

  async list(dto: PaginationDto, actor: JwtUser, filters: { userId?: string; status?: TaskStatus; from?: string; to?: string; orderId?: string }) {
    const where: Prisma.TaskWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    else if (!this.canSeeAll(actor)) where.userId = actor.sub;
    if (filters.status) where.status = filters.status;
    if (filters.orderId) where.orderId = filters.orderId;
    const range = dateRange(filters.from, filters.to);
    if (range) where.date = range;
    if (dto.search) where.title = { contains: dto.search, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where, skip: dto.skip, take: dto.limit, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          order: { select: { id: true, number: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginate(items, total, dto);
  }

  async create(dto: CreateTaskDto, actor: JwtUser) {
    const userId = dto.userId ?? actor.sub;
    const task = await this.prisma.task.create({
      data: {
        title: dto.title, description: dto.description,
        date: new Date(dto.date),
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined,
        status: dto.status ?? 'TODO', note: dto.note, qty: dto.qty,
        userId, createdById: actor.sub, orderId: dto.orderId || null, stage: dto.stage,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.TASK_CREATED, entity: 'Task', entityId: task.id, newValue: { title: task.title, userId } });
    if (userId !== actor.sub) {
      await this.notifications.push({ userId, type: 'TASK_ASSIGNED', title: 'Sizga yangi vazifa berildi', body: task.title, link: '/my-tasks' });
    }
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, actor: JwtUser) {
    const existing = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    if (existing.userId !== actor.sub && !this.canSeeAll(actor)) {
      throw new Error('Bu vazifani o‘zgartirish huquqingiz yo‘q');
    }
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title, description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : dto.status === 'DONE' ? new Date() : undefined,
        status: dto.status, note: dto.note, qty: dto.qty,
        ...(dto.userId ? { user: { connect: { id: dto.userId } } } : {}),
        ...(dto.orderId !== undefined ? { order: dto.orderId ? { connect: { id: dto.orderId } } : { disconnect: true } } : {}),
      },
    });
    this.audit.log({
      userId: actor.sub,
      action: dto.status === 'DONE' ? AUDIT_ACTIONS.TASK_COMPLETED : AUDIT_ACTIONS.TASK_UPDATED,
      entity: 'Task', entityId: id, oldValue: { status: existing.status }, newValue: dto,
    });
    return task;
  }

  async remove(id: string, actor: JwtUser) {
    await this.prisma.task.delete({ where: { id } });
    this.audit.log({ userId: actor.sub, action: 'TASK_DELETED', entity: 'Task', entityId: id });
    return { success: true };
  }

  /** Daily / weekly / monthly plan roll-up for one employee. */
  async plan(userId: string, period: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'WEEKLY') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === 'MONTHLY') start.setDate(1);
    const end = new Date(start);
    if (period === 'DAILY') end.setDate(start.getDate() + 1);
    if (period === 'WEEKLY') end.setDate(start.getDate() + 7);
    if (period === 'MONTHLY') end.setMonth(start.getMonth() + 1);

    const [tasks, stored, entries] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, date: { gte: start, lt: end } },
        orderBy: { date: 'asc' },
        include: { order: { select: { number: true } } },
      }),
      this.prisma.plan.findFirst({ where: { userId, period, dateFrom: start } }),
      this.prisma.stageEntry.findMany({
        where: { userId, date: { gte: start, lt: end }, cancelled: false },
        include: { orderStage: { select: { stage: true, order: { select: { number: true } } } } },
        orderBy: { date: 'desc' }, take: 100,
      }),
    ]);

    const done = tasks.filter((t) => t.status === 'DONE').length;
    const producedQty = entries.reduce((a, e) => a + e.qty, 0);
    return {
      period, dateFrom: start, dateTo: end,
      tasks, total: tasks.length, done, overdue: tasks.filter((t) => t.status !== 'DONE' && t.date < now).length,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      targetQty: stored?.targetQty ?? 0,
      producedQty,
      entries,
    };
  }

  async setPlan(userId: string, period: 'DAILY' | 'WEEKLY' | 'MONTHLY', targetQty: number, actor: JwtUser) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'WEEKLY') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === 'MONTHLY') start.setDate(1);
    const end = new Date(start);
    if (period === 'DAILY') end.setDate(start.getDate() + 1);
    if (period === 'WEEKLY') end.setDate(start.getDate() + 7);
    if (period === 'MONTHLY') end.setMonth(start.getMonth() + 1);

    const plan = await this.prisma.plan.upsert({
      where: { userId_period_dateFrom: { userId, period, dateFrom: start } },
      create: { userId, period, dateFrom: start, dateTo: end, targetQty },
      update: { targetQty, dateTo: end },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.PLAN_UPDATED, entity: 'Plan', entityId: plan.id, newValue: { userId, period, targetQty } });
    return plan;
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private service: TasksService) {}

  @Get('tasks')
  list(
    @Query() dto: PaginationDto, @CurrentUser() actor: JwtUser,
    @Query('userId') userId?: string, @Query('status') status?: TaskStatus,
    @Query('from') from?: string, @Query('to') to?: string, @Query('orderId') orderId?: string,
  ) {
    return this.service.list(dto, actor, { userId, status, from, to, orderId });
  }

  @Get('tasks/my')
  my(@Query() dto: PaginationDto, @CurrentUser() actor: JwtUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.list(dto, actor, { userId: actor.sub, from, to });
  }

  @Post('tasks')
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: JwtUser) { return this.service.create(dto, actor); }

  @Patch('tasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() actor: JwtUser) { return this.service.update(id, dto, actor); }

  @Delete('tasks/:id')
  @RequirePermissions('tasks.delete')
  remove(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.service.remove(id, actor); }

  @Get('plans/:period')
  @ApiOperation({ summary: 'DAILY | WEEKLY | MONTHLY plan for the caller (or ?userId= for managers)' })
  plan(@Param('period') period: 'DAILY' | 'WEEKLY' | 'MONTHLY', @CurrentUser() actor: JwtUser, @Query('userId') userId?: string) {
    const target = userId && (actor.permissions.includes('*') || actor.permissions.includes('users.read')) ? userId : actor.sub;
    return this.service.plan(target, period.toUpperCase() as any);
  }

  @Post('plans/:period/my')
  @ApiOperation({ summary: 'Set own DAILY/WEEKLY/MONTHLY target qty' })
  setMyPlan(
    @Param('period') period: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    @Body() body: { targetQty: number },
    @CurrentUser() actor: JwtUser,
  ) {
    const qty = Number(body.targetQty);
    if (!Number.isFinite(qty) || qty < 0) throw new BadRequestException('Plan miqdori noto‘g‘ri');
    return this.service.setPlan(actor.sub, period.toUpperCase() as any, qty, actor);
  }

  @Post('plans/:period')
  @RequirePermissions('plans.update')
  setPlan(
    @Param('period') period: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    @Body() body: { userId: string; targetQty: number },
    @CurrentUser() actor: JwtUser,
  ) {
    return this.service.setPlan(body.userId, period.toUpperCase() as any, body.targetQty, actor);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
