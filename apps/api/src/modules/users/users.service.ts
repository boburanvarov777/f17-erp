import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtUser } from '../../common/decorators';
import { isSuperProAdmin, SUPER_PRO_ADMIN_ROLE } from '../../common/permissions';
import { paginate } from '../../common/dto/pagination.dto';
import { badRequest, forbidden, notFound } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildOrderBy } from '../../common/utils/order-by';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto';

const SELECT = {
  id: true, firstName: true, lastName: true, phone: true, login: true, email: true, avatar: true,
  note: true, employeeId: true, position: true, status: true, lang: true, telegramId: true,
  telegramUsername: true, lastLoginAt: true, createdAt: true, archivedAt: true,
  department: { select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true, stage: true } },
  role: { select: { id: true, code: true, name: true, permissions: true } },
} satisfies Prisma.UserSelect;

const SORTABLE = ['firstName', 'lastName', 'login', 'phone', 'createdAt', 'lastLoginAt', 'status', 'position'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Managers only see their own department; full-access roles see everyone. */
  private scope(actor: JwtUser, where: Prisma.UserWhereInput): Prisma.UserWhereInput {
    const canSeeAll = actor.permissions.includes('*') || actor.permissions.includes('users.delete');
    if (canSeeAll || !actor.departmentId) return where;
    return { ...where, departmentId: actor.departmentId };
  }

  private serialize<T extends { telegramId?: bigint | null }>(u: T) {
    return { ...u, telegramId: u.telegramId ? String(u.telegramId) : null };
  }

  /** Super Pro Admin users are invisible to everyone else. */
  private scopedWhere(actor: JwtUser, where: Prisma.UserWhereInput = {}): Prisma.UserWhereInput {
    let scoped = this.scope(actor, where);
    if (!isSuperProAdmin(actor)) {
      scoped = { AND: [scoped, { role: { code: { not: SUPER_PRO_ADMIN_ROLE } } }] };
    }
    return scoped;
  }

  private assertVisibleTarget(actor: JwtUser, roleCode: string | undefined): void {
    if (!isSuperProAdmin(actor) && roleCode === SUPER_PRO_ADMIN_ROLE) {
      throw notFound('err_user_not_found');
    }
  }

  async findAll(dto: QueryUsersDto, actor: JwtUser) {
    let where: Prisma.UserWhereInput = { archivedAt: null };
    if (dto.status) where.status = dto.status;
    if (dto.departmentId) where.departmentId = dto.departmentId;
    if (dto.roleId) where.roleId = dto.roleId;
    if (dto.search) {
      where.OR = [
        { firstName: { contains: dto.search, mode: 'insensitive' } },
        { lastName: { contains: dto.search, mode: 'insensitive' } },
        { login: { contains: dto.search, mode: 'insensitive' } },
        { phone: { contains: dto.search } },
        { position: { contains: dto.search, mode: 'insensitive' } },
      ];
    }
    where = this.scopedWhere(actor, where);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, select: SELECT, skip: dto.skip, take: dto.limit,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { createdAt: 'desc' }) as any,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items.map((i) => this.serialize(i)), total, dto);
  }

  async findOne(id: string, actor: JwtUser) {
    const user = await this.prisma.user.findFirst({ where: this.scopedWhere(actor, { id }), select: SELECT });
    if (!user) throw notFound('err_user_not_found');
    return this.serialize(user);
  }

  async create(dto: CreateUserDto, actor: JwtUser) {
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw badRequest('err_role_not_found');
    if (role.code === SUPER_PRO_ADMIN_ROLE && !isSuperProAdmin(actor)) {
      throw forbidden('err_super_role_only');
    }
    if (role.permissions.includes('*') && !isSuperProAdmin(actor)) {
      throw forbidden('err_super_role_only');
    }

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: normalizePhone(dto.phone),
        login: dto.login.trim().toLowerCase(),
        passwordHash: await AuthService.hash(dto.password),
        email: dto.email,
        avatar: dto.avatar,
        note: dto.note,
        employeeId: dto.employeeId || null,
        position: dto.position,
        departmentId: dto.departmentId || null,
        roleId: dto.roleId,
        status: dto.status ?? 'ACTIVE',
        lang: dto.lang ?? 'UZ',
      },
      select: SELECT,
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.USER_CREATED, entity: 'User', entityId: user.id, newValue: { login: user.login, role: role.code } });
    return this.serialize(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: JwtUser) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw notFound('err_user_not_found');
    this.assertVisibleTarget(actor, existing.role.code);

    if (dto.roleId && dto.roleId !== existing.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw badRequest('err_role_not_found');
      if (role.code === SUPER_PRO_ADMIN_ROLE && !isSuperProAdmin(actor)) {
        throw forbidden('err_super_role_only');
      }
      if (role.permissions.includes('*') && !isSuperProAdmin(actor)) {
        throw forbidden('err_super_role_only');
      }
      this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.ROLE_CHANGED, entity: 'User', entityId: id, oldValue: { roleId: existing.roleId }, newValue: { roleId: dto.roleId } });
    }
    if (dto.departmentId && dto.departmentId !== existing.departmentId) {
      this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.DEPARTMENT_CHANGED, entity: 'User', entityId: id, oldValue: { departmentId: existing.departmentId }, newValue: { departmentId: dto.departmentId } });
    }

    const data: Prisma.UserUpdateInput = {
      firstName: dto.firstName, lastName: dto.lastName, email: dto.email, avatar: dto.avatar,
      note: dto.note, position: dto.position, status: dto.status, lang: dto.lang,
      employeeId: dto.employeeId === '' ? null : dto.employeeId,
    };
    if (dto.phone) data.phone = normalizePhone(dto.phone);
    if (dto.login) data.login = dto.login.trim().toLowerCase();
    if (dto.password) data.passwordHash = await AuthService.hash(dto.password);
    if (dto.roleId) data.role = { connect: { id: dto.roleId } };
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId ? { connect: { id: dto.departmentId } } : { disconnect: true };
    }

    const user = await this.prisma.user.update({ where: { id }, data, select: SELECT });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.USER_UPDATED, entity: 'User', entityId: id, newValue: dto });
    return this.serialize(user);
  }

  async setStatus(id: string, status: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED', actor: JwtUser) {
    if (id === actor.sub && status !== 'ACTIVE') throw badRequest('err_cannot_block_self');
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw notFound('err_user_not_found');
    this.assertVisibleTarget(actor, existing.role.code);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
      select: SELECT,
    });
    if (status !== 'ACTIVE') {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    this.audit.log({
      userId: actor.sub,
      action: status === 'ARCHIVED' ? AUDIT_ACTIONS.USER_ARCHIVED : AUDIT_ACTIONS.USER_BLOCKED,
      entity: 'User', entityId: id, newValue: { status },
    });
    return this.serialize(user);
  }

  async resetPassword(id: string, newPassword: string, actor: JwtUser) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw notFound('err_user_not_found');
    this.assertVisibleTarget(actor, existing.role.code);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await AuthService.hash(newPassword) } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.PASSWORD_RESET, entity: 'User', entityId: id });
    return { success: true };
  }

  async unlinkTelegram(id: string, actor: JwtUser) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw notFound('err_user_not_found');
    this.assertVisibleTarget(actor, existing.role.code);
    const user = await this.prisma.user.update({
      where: { id }, data: { telegramId: null, telegramUsername: null, telegramLinkedAt: null }, select: SELECT,
    });
    this.audit.log({ userId: actor.sub, action: 'TELEGRAM_UNLINKED', entity: 'User', entityId: id });
    return this.serialize(user);
  }

  /** Employee productivity board — today / week / month task completion. */
  async monitoring(actor: JwtUser, departmentId?: string) {
    const where = this.scopedWhere(actor, { status: 'ACTIVE' as const, ...(departmentId ? { departmentId } : {}) });
    const users = await this.prisma.user.findMany({
      where, select: { id: true, firstName: true, lastName: true, position: true, avatar: true, department: { select: { nameUz: true, code: true } } },
      orderBy: { lastName: 'asc' }, take: 200,
    });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const grouped = await this.prisma.task.groupBy({
      by: ['userId', 'status'],
      where: { userId: { in: users.map((u) => u.id) }, date: { gte: startOfMonth } },
      _count: { _all: true },
    });
    const dailyPlans = await this.prisma.plan.findMany({
      where: { userId: { in: users.map((u) => u.id) }, period: 'DAILY', dateFrom: startOfDay },
      select: { userId: true, targetQty: true, doneQty: true },
    });
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);
    const producedToday = await this.prisma.stageEntry.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((u) => u.id) },
        date: { gte: startOfDay, lt: endOfDay },
        cancelled: false,
      },
      _sum: { qty: true },
    });
    const producedByUser = Object.fromEntries(
      producedToday.map((p) => [p.userId, p._sum.qty ?? 0]),
    );
    const planByUser = Object.fromEntries(dailyPlans.map((p) => [p.userId, p]));
    const tasks = await this.prisma.task.findMany({
      where: { userId: { in: users.map((u) => u.id) }, date: { gte: startOfMonth } },
      select: { userId: true, status: true, date: true },
    });

    const calc = (userId: string, from: Date) => {
      const t = tasks.filter((x) => x.userId === userId && x.date >= from);
      return { total: t.length, done: t.filter((x) => x.status === 'DONE').length };
    };

    return users.map((u) => {
      const today = calc(u.id, startOfDay);
      const week = calc(u.id, startOfWeek);
      const month = calc(u.id, startOfMonth);
      const overdue = tasks.filter((x) => x.userId === u.id && x.status !== 'DONE' && x.date < startOfDay).length;
      const daily = planByUser[u.id];
      return {
        ...u,
        today, week, month, overdue,
        progress: month.total ? Math.round((month.done / month.total) * 100) : 0,
        dailyPlan: {
          targetQty: daily?.targetQty ?? 0,
          doneQty: producedByUser[u.id] ?? daily?.doneQty ?? 0,
        },
        _grouped: grouped.filter((g) => g.userId === u.id).length,
      };
    });
  }
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return '+' + digits;
}
