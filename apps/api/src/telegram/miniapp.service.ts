import { Injectable, Logger } from '@nestjs/common';
import { parse, validate, SignatureInvalidError, ExpiredError } from '@telegram-apps/init-data-node';
import { unauthorized } from '../common/i18n/api-errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../modules/auth/auth.service';
import { AUDIT_ACTIONS } from '../modules/audit/audit.service';

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

@Injectable()
export class MiniAppService {
  private readonly log = new Logger('MiniApp');
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  /** Verifies Telegram WebApp initData (hash + auth_date). */
  verifyInitData(initData: string, maxAgeSeconds = 86400): TelegramInitUser {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw unauthorized('err_bot_not_configured');
    if (!initData?.trim()) throw unauthorized('err_initdata_missing');

    try {
      validate(initData, token, { expiresIn: maxAgeSeconds });
    } catch (e) {
      if (e instanceof ExpiredError) throw unauthorized('err_initdata_expired');
      if (e instanceof SignatureInvalidError) throw unauthorized('err_initdata_signature');
      throw unauthorized('err_initdata_invalid');
    }

    const parsed = parse(initData);
    const user = parsed.user;
    if (!user?.id) throw unauthorized('err_initdata_no_user');
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
    const tgId = BigInt(tgUser.id);
    const user = await this.prisma.user.findUnique({
      where: { telegramId: tgId },
      include: { role: true, department: true },
    });
    if (!user) throw unauthorized('err_tg_not_linked');
    if (user.status !== 'ACTIVE') throw unauthorized('err_user_inactive');

    const session = await this.prisma.telegramSession.findUnique({
      where: { telegramId: tgId },
      select: { phone: true },
    });
    const tokens = await this.auth.issueTokens(user.id, ctx);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.auth.recordAccess(user.id, AUDIT_ACTIONS.LOGIN, {
      ...ctx,
      telegramId: tgId,
      telegramUsername: tgUser.username,
      phone: session?.phone ?? null,
    });
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
    // Login + password are the real check here; initData only binds the Telegram
    // account. If Telegram's signature cannot be verified (most often
    // TELEGRAM_BOT_TOKEN on the server is not this bot's current token), still let
    // valid credentials in — without the binding — and log why.
    let tgUser: TelegramInitUser;
    try {
      tgUser = this.verifyInitData(initData);
    } catch (e) {
      const body = (e as { getResponse?: () => unknown })?.getResponse?.() as { i18n?: { key?: string } } | undefined;
      const reason = body?.i18n?.key ?? String(e);
      this.log.warn(`Mini App login without Telegram binding (login=${login}): ${reason}. Check TELEGRAM_BOT_TOKEN.`);
      return this.auth.login({ login, password, departmentCode }, ctx);
    }
    const tgId = BigInt(tgUser.id);
    const session = await this.prisma.telegramSession.findUnique({
      where: { telegramId: tgId },
      select: { phone: true },
    });
    // Check the Telegram binding before a session is issued (not after).
    const target = await this.auth.validateUser(login, password);
    if (target.telegramId && target.telegramId !== tgId) {
      throw unauthorized('err_account_other_tg');
    }
    const result = await this.auth.login({ login, password, departmentCode }, {
      ...ctx,
      telegramId: tgId,
      telegramUsername: tgUser.username,
      phone: session?.phone ?? null,
    });

    // Same Telegram device may switch test accounts (login + password each time).
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { telegramId: tgId, id: { not: result.user.id } },
        data: { telegramId: null, telegramUsername: null, telegramLinkedAt: null },
      });
      await tx.user.update({
        where: { id: result.user.id },
        data: {
          telegramId: tgId,
          telegramUsername: tgUser.username ?? null,
          telegramLinkedAt: new Date(),
        },
      });
    });

    return result;
  }
}
