import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { forbidden, unauthorized } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/decorators';
import { AuditService, AUDIT_ACTIONS, formatAuditTelegramUsername } from '../audit/audit.service';
import { LoginDto } from './dto';

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  static hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTS);
  }

  private sha(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async validateUser(login: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { login: login.trim().toLowerCase() },
      include: { role: true, department: true },
    });
    if (!user) throw unauthorized('err_bad_credentials');
    if (user.status === 'BLOCKED') throw forbidden('err_user_blocked');
    if (user.status === 'ARCHIVED') throw forbidden('err_user_archived');

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw unauthorized('err_bad_credentials');
    return user;
  }

  async login(dto: LoginDto, ctx: { ip?: string; device?: string } = {}) {
    const user = await this.validateUser(dto.login, dto.password);

    if (dto.departmentCode && user.department?.code !== dto.departmentCode && !user.role.permissions.includes('*')) {
      throw forbidden('err_dept_forbidden');
    }

    const tokens = await this.issueTokens(user.id, ctx);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    this.audit.log({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      entity: 'User',
      entityId: user.id,
      telegramUsername: formatAuditTelegramUsername(user.telegramUsername),
      ...ctx,
    });

    return { ...tokens, user: this.publicUser(user) };
  }

  publicUser(user: any) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.lastName} ${user.firstName}`,
      login: user.login,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
      position: user.position,
      lang: user.lang,
      status: user.status,
      telegramId: user.telegramId ? String(user.telegramId) : null,
      role: user.role ? { id: user.role.id, code: user.role.code, name: user.role.name } : null,
      permissions: user.role?.permissions ?? [],
      department: user.department
        ? { id: user.department.id, code: user.department.code, name: user.department.nameUz, stage: user.department.stage }
        : null,
    };
  }

  async issueTokens(userId: string, ctx: { ip?: string; device?: string } = {}): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });

    const payload: JwtUser = {
      sub: user.id,
      login: user.login,
      roleId: user.roleId,
      roleCode: user.role.code,
      permissions: user.role.permissions,
      departmentId: user.departmentId,
      fullName: `${user.lastName} ${user.firstName}`,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      expiresIn: (process.env.JWT_ACCESS_TTL || '15m') as unknown as number,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const days = parseInt((process.env.JWT_REFRESH_TTL || '30d').replace('d', ''), 10) || 30;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.sha(refreshToken),
        expiresAt: new Date(Date.now() + days * 864e5),
        ip: ctx.ip,
        userAgent: ctx.device,
      },
    });

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  async refresh(refreshToken: string, ctx: { ip?: string; device?: string } = {}) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha(refreshToken) },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw unauthorized('err_refresh_invalid');
    }
    // rotation
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(record.userId, ctx);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.userId },
      include: { role: true, department: true },
    });
    return { ...tokens, user: this.publicUser(user) };
  }

  async logout(userId: string, refreshToken?: string, ctx: { ip?: string; device?: string } = {}) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.sha(refreshToken), userId },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramUsername: true },
    });
    this.audit.log({
      userId,
      action: AUDIT_ACTIONS.LOGOUT,
      telegramUsername: formatAuditTelegramUsername(user?.telegramUsername),
      ...ctx,
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true, department: true },
    });
    return this.publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw unauthorized('err_current_password');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hash(newPassword) },
    });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.audit.log({ userId, action: AUDIT_ACTIONS.PASSWORD_RESET, entity: 'User', entityId: userId });
    return { success: true };
  }
}
