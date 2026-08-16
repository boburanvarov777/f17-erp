import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Lang } from '@prisma/client';
import { Bot, Context, InlineKeyboard, Keyboard, webhookCallback } from 'grammy';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../modules/audit/audit.service';
import { t } from './telegram.i18n';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  public bot?: Bot;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
      return;
    }
    this.bot = new Bot(token);
    this.register();

    try {
      await this.bot.init();
      this.logger.log(`Telegram bot @${this.bot.botInfo.username} initialised`);
    } catch (e) {
      this.logger.error(`Telegram init failed: ${(e as Error).message}`);
      this.bot = undefined;
      return;
    }

    const appUrl = process.env.APP_URL;
    if (process.env.TELEGRAM_USE_POLLING === 'true' || !appUrl) {
      void this.bot.start({ drop_pending_updates: true, onStart: () => this.logger.log('Bot polling started') });
    } else {
      const url = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;
      await this.bot.api
        .setWebhook(url, { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined, drop_pending_updates: true })
        .then(() => this.logger.log(`Webhook set: ${url}`))
        .catch((e) => this.logger.error(`setWebhook failed: ${e.message}`));
    }
  }

  webhook() {
    if (!this.bot) return null;
    return webhookCallback(this.bot, 'express', {
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    });
  }

  private async session(ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    return this.prisma.telegramSession.upsert({
      where: { telegramId },
      create: { telegramId, username: ctx.from?.username, lang: 'UZ', step: 'LANG' },
      update: { username: ctx.from?.username },
    });
  }

  private setStep(telegramId: bigint, step: string, data: Record<string, unknown> = {}) {
    return this.prisma.telegramSession.update({ where: { telegramId }, data: { step, ...data } });
  }

  private linkedUser(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: { role: true, department: true },
    });
  }

  private miniAppKeyboard(lang: Lang) {
    const url = process.env.TELEGRAM_MINIAPP_URL || `${(process.env.APP_URL || '').replace(/\/$/, '')}/miniapp`;
    if (!/^https:\/\//.test(url)) return undefined;
    return new InlineKeyboard().webApp(t(lang, 'open_miniapp'), url);
  }

  private register(): void {
    const bot = this.bot!;

    bot.catch((err) => this.logger.error(`Bot error: ${err.message}`, err.stack));

    bot.command('start', async (ctx) => {
      const s = await this.session(ctx);
      const linked = await this.linkedUser(BigInt(ctx.from!.id));
      if (linked && linked.status === 'ACTIVE') {
        await this.setStep(BigInt(ctx.from!.id), 'READY');
        return this.sendWelcome(ctx, linked, s.lang);
      }
      await this.setStep(BigInt(ctx.from!.id), 'LANG');
      await ctx.reply(t(s.lang, 'choose_lang'), {
        reply_markup: new InlineKeyboard()
          .text('🇺🇿 O‘zbekcha', 'lang:UZ').row()
          .text('🇷🇺 Русский', 'lang:RU').row()
          .text('🇬🇧 English', 'lang:EN'),
      });
    });

    bot.callbackQuery(/^lang:(UZ|RU|EN)$/, async (ctx) => {
      const lang = ctx.match![1] as Lang;
      const telegramId = BigInt(ctx.from.id);
      await this.prisma.telegramSession.update({ where: { telegramId }, data: { lang, step: 'PHONE' } });
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(t(lang, 'lang_set'));

      const linked = await this.linkedUser(telegramId);
      if (linked) {
        await this.prisma.user.update({ where: { id: linked.id }, data: { lang } });
        await this.setStep(telegramId, 'READY');
        return this.sendWelcome(ctx, linked, lang);
      }
      await ctx.reply(t(lang, 'ask_phone'), {
        parse_mode: 'Markdown',
        reply_markup: new Keyboard().requestContact(t(lang, 'btn_phone')).resized().oneTime(),
      });
    });

    bot.on('message:contact', async (ctx) => {
      const s = await this.session(ctx);
      const lang = s.lang;
      const contact = ctx.message.contact;

      if ((ctx.message as any).forward_origin || (ctx.message as any).forward_from || (ctx.message as any).forward_date) {
        return ctx.reply(t(lang, 'err_forwarded'));
      }
      if (!contact.user_id) return ctx.reply(t(lang, 'err_manual'));
      if (contact.user_id !== ctx.from!.id) return ctx.reply(t(lang, 'err_other'));

      await this.verifyPhone(ctx, contact.phone_number, lang);
    });

    bot.on('message:text', async (ctx) => {
      const telegramId = BigInt(ctx.from!.id);
      const s = await this.session(ctx);
      const lang = s.lang;
      const text = ctx.message.text.trim();

      if (s.step === 'PHONE') {
        if (/[\d][\d\s()+-]{7,}/.test(text)) return ctx.reply(t(lang, 'err_manual'));
        return ctx.reply(t(lang, 'ask_phone'), {
          parse_mode: 'Markdown',
          reply_markup: new Keyboard().requestContact(t(lang, 'btn_phone')).resized().oneTime(),
        });
      }

      const user = await this.linkedUser(telegramId);
      if (!user || user.status !== 'ACTIVE') {
        await this.setStep(telegramId, 'PHONE');
        return ctx.reply(t(lang, 'err_not_found'));
      }

      const kb = this.miniAppKeyboard(lang);
      return ctx.reply(t(lang, 'use_miniapp'), { reply_markup: kb ?? { remove_keyboard: true } });
    });
  }

  private async verifyPhone(ctx: Context, rawPhone: string, lang: Lang) {
    const telegramId = BigInt(ctx.from!.id);
    const phone = '+' + rawPhone.replace(/\D/g, '');

    const matches = await this.prisma.user.findMany({
      where: { phone, status: 'ACTIVE' },
      include: { role: true, department: true },
    });
    if (!matches.length) {
      await this.prisma.telegramSession.update({ where: { telegramId }, data: { phone, attempts: { increment: 1 } } });
      return ctx.reply(t(lang, 'err_not_found'), { reply_markup: { remove_keyboard: true } });
    }
    if (matches.length > 1) {
      const kb = this.miniAppKeyboard(lang);
      return ctx.reply(t(lang, 'err_multi_phone'), {
        parse_mode: 'Markdown',
        reply_markup: kb ?? { remove_keyboard: true },
      });
    }

    const user = matches[0];
    if (user.telegramId && user.telegramId !== telegramId) {
      return ctx.reply(t(lang, 'err_taken'), { reply_markup: { remove_keyboard: true } });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { telegramId, telegramUsername: ctx.from?.username, telegramLinkedAt: new Date(), lang },
    });
    await this.prisma.telegramSession.update({ where: { telegramId }, data: { phone, userId: user.id, step: 'READY' } });
    this.audit.log({ userId: user.id, action: AUDIT_ACTIONS.TELEGRAM_LINKED, entity: 'User', entityId: user.id, newValue: { telegramId: String(telegramId) } });

    return this.sendWelcome(ctx, user, lang);
  }

  private async sendWelcome(ctx: Context, user: any, lang: Lang) {
    await ctx.reply(
      t(lang, 'welcome', {
        name: `${user.lastName} ${user.firstName}`,
        dept: user.department?.nameUz ?? '—',
        position: user.position ?? user.role?.name ?? '—',
      }),
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } },
    );
    const kb = this.miniAppKeyboard(lang);
    if (kb) await ctx.reply(t(lang, 'use_miniapp'), { reply_markup: kb });
  }
}
