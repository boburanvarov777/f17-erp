import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
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

  /**
   * Verifies Telegram WebApp initData exactly as documented:
   *   secret = HMAC_SHA256(bot_token, "WebAppData")
   *   hash   = HMAC_SHA256(data_check_string, secret)
   * A forged Telegram user cannot pass this check.
   */
  verifyInitData(initData: string, maxAgeSeconds = 86400): TelegramInitUser {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new UnauthorizedException('Bot sozlanmagan');
    if (!initData) throw new UnauthorizedException('initData yo‘q');

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('initData hash yo‘q');
    params.delete('hash');
    params.delete('signature');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (computed !== hash) throw new UnauthorizedException('initData imzosi noto‘g‘ri');

    const authDate = Number(params.get('auth_date') ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
      throw new UnauthorizedException('initData muddati tugagan');
    }

    const raw = params.get('user');
    if (!raw) throw new UnauthorizedException('initData user yo‘q');
    return JSON.parse(raw) as TelegramInitUser;
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
