import { Injectable, UnauthorizedException } from '@nestjs/common';
import { parse, validate, SignatureInvalidError, ExpiredError } from '@telegram-apps/init-data-node';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../modules/auth/auth.service';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

@Injectable()
export class MiniAppService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  /** Verifies Telegram WebApp initData (hash + auth_date). */
  verifyInitData(initData: string, maxAgeSeconds = 86400): TelegramInitUser {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new UnauthorizedException('Bot sozlanmagan');
    if (!initData?.trim()) throw new UnauthorizedException('initData yo‘q');

    try {
      validate(initData, token, { expiresIn: maxAgeSeconds });
    } catch (e) {
      if (e instanceof ExpiredError) throw new UnauthorizedException('initData muddati tugagan');
      if (e instanceof SignatureInvalidError) throw new UnauthorizedException('initData imzosi noto‘g‘ri');
      throw new UnauthorizedException('initData noto‘g‘ri');
    }

    const parsed = parse(initData);
    const user = parsed.user;
    if (!user?.id) throw new UnauthorizedException('initData user yo‘q');
    return {
      id: user.id,
      first_name: user.firstName as string | undefined,
      last_name: user.lastName as string | undefined,
      username: user.username as string | undefined,
      language_code: user.languageCode as string | undefined,
    };
  }

  /** Exchanges a verified Telegram identity for ERP tokens. */
  async authenticate(initData: string, ctx: { ip?: string; device?: string } = {}) {
    const tgUser = this.verifyInitData(initData);
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(tgUser.id) },
      include: { role: true, department: true },
    });
    if (!user) throw new UnauthorizedException('Telegram akkaunt tizimga biriktirilmagan');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Foydalanuvchi faol emas');

    const tokens = await this.auth.issueTokens(user.id, ctx);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { ...tokens, user: this.auth.publicUser(user) };
  }

  /** Mini App login screen: department + login + password, cross-checked against the Telegram identity. */
  async loginWithCredentials(
    initData: string,
    login: string,
    password: string,
    departmentCode?: string,
    ctx: { ip?: string; device?: string } = {},
  ) {
    const tgUser = this.verifyInitData(initData);
    const result = await this.auth.login({ login, password, departmentCode }, ctx);
    const linked = await this.prisma.user.findUnique({ where: { id: result.user.id } });
    if (linked?.telegramId && String(linked.telegramId) !== String(tgUser.id)) {
      throw new UnauthorizedException('Bu hisob boshqa Telegram akkauntga biriktirilgan');
    }
    if (!linked?.telegramId) {
      await this.prisma.user.update({
        where: { id: result.user.id },
        data: { telegramId: BigInt(tgUser.id), telegramUsername: tgUser.username, telegramLinkedAt: new Date() },
      });
    }
    return result;
  }
}
