import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Lang, StageType } from '@prisma/client';
import { Bot, Context, InlineKeyboard, Keyboard, webhookCallback } from 'grammy';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../modules/audit/audit.service';
import { ProductionService } from '../modules/production/production.service';
import { t } from './telegram.i18n';

const STAGE_LABEL: Record<StageType, string> = {
  CUTTING: 'Kesim', SEWING: 'Tikuv', WASHING: 'Varka', LASER: 'Lazer', PACKING: 'Upakovka', LOADING: 'Ortish',
};

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  public bot?: Bot;
  private started = false;

  constructor(
    private prisma: PrismaService,
    private production: ProductionService,
    private audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
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
      this.started = true;
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

  // ───────────────────────── session helpers ─────────────────────────

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

  private mainMenu(lang: Lang) {
    return new Keyboard()
      .text(t(lang, 'menu_report')).text(t(lang, 'menu_tasks')).row()
      .text(t(lang, 'menu_plan')).text(t(lang, 'menu_profile')).row()
      .text(t(lang, 'menu_lang'))
      .resized();
  }

  private miniAppKeyboard(lang: Lang) {
    const url = process.env.TELEGRAM_MINIAPP_URL || `${(process.env.APP_URL || '').replace(/\/$/, '')}/miniapp`;
    if (!/^https:\/\//.test(url)) return undefined;
    return new InlineKeyboard().webApp(t(lang, 'open_miniapp'), url);
  }

  // ───────────────────────── handlers ─────────────────────────

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

    // ── contact verification: the security-critical path ──
    bot.on('message:contact', async (ctx) => {
      const s = await this.session(ctx);
      const lang = s.lang;
      const contact = ctx.message.contact;

      // A forwarded contact is never the sender's own.
      if ((ctx.message as any).forward_origin || (ctx.message as any).forward_from || (ctx.message as any).forward_date) {
        return ctx.reply(t(lang, 'err_forwarded'));
      }
      // A contact without user_id was hand-built, not shared through the button.
      if (!contact.user_id) {
        return ctx.reply(t(lang, 'err_manual'));
      }
      // The shared contact must be the sender themselves.
      if (contact.user_id !== ctx.from!.id) {
        return ctx.reply(t(lang, 'err_other'));
      }

      await this.verifyPhone(ctx, contact.phone_number, lang);
    });

    bot.on('message:text', async (ctx) => {
      const telegramId = BigInt(ctx.from!.id);
      const s = await this.session(ctx);
      const lang = s.lang;
      const text = ctx.message.text.trim();

      // Reject typed/pasted phone numbers outright.
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

      if (text === t(lang, 'menu_lang')) {
        return ctx.reply(t(lang, 'choose_lang'), {
          reply_markup: new InlineKeyboard()
            .text('🇺🇿 O‘zbekcha', 'lang:UZ').row()
            .text('🇷🇺 Русский', 'lang:RU').row()
            .text('🇬🇧 English', 'lang:EN'),
        });
      }
      if (text === t(lang, 'menu_profile')) return this.sendProfile(ctx, user, lang);
      if (text === t(lang, 'menu_tasks')) return this.sendTasks(ctx, user.id, lang);
      if (text === t(lang, 'menu_plan')) return this.sendPlan(ctx, user.id, lang);
      if (text === t(lang, 'cancel')) {
        await this.setStep(telegramId, 'READY');
        return ctx.reply(t(lang, 'cancelled'), { reply_markup: this.mainMenu(lang) });
      }
      if (text === t(lang, 'menu_report')) return this.startReport(ctx, user, lang);

      // numeric steps of the report flow
      if (s.step?.startsWith('QTY:')) return this.handleQty(ctx, s, user, lang, text);
      if (s.step?.startsWith('DEFECT:')) return this.handleDefect(ctx, s, user, lang, text);

      return ctx.reply(t(lang, 'menu'), { reply_markup: this.mainMenu(lang) });
    });

    bot.callbackQuery(/^order:(.+)$/, async (ctx) => {
      const telegramId = BigInt(ctx.from.id);
      const s = await this.session(ctx);
      const user = await this.linkedUser(telegramId);
      if (!user) return ctx.answerCallbackQuery({ text: t(s.lang, 'err_not_found') });
      const orderId = ctx.match![1];
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      const stage = user.department?.stage;
      if (!order || !stage) return ctx.answerCallbackQuery({ text: t(s.lang, 'no_stage') });

      await this.setStep(telegramId, `QTY:${orderId}`);
      await ctx.answerCallbackQuery();
      await ctx.reply(t(s.lang, 'ask_qty', { order: order.number, stage: STAGE_LABEL[stage] }), {
        parse_mode: 'Markdown',
        reply_markup: new Keyboard().text(t(s.lang, 'cancel')).resized(),
      });
    });
  }

  // ───────────────────────── flows ─────────────────────────

  private async verifyPhone(ctx: Context, rawPhone: string, lang: Lang) {
    const telegramId = BigInt(ctx.from!.id);
    const phone = '+' + rawPhone.replace(/\D/g, '');

    const user = await this.prisma.user.findUnique({ where: { phone }, include: { role: true, department: true } });
    if (!user) {
      await this.prisma.telegramSession.update({ where: { telegramId }, data: { phone, attempts: { increment: 1 } } });
      return ctx.reply(t(lang, 'err_not_found'), { reply_markup: { remove_keyboard: true } });
    }
    if (user.status !== 'ACTIVE') return ctx.reply(t(lang, 'err_blocked'), { reply_markup: { remove_keyboard: true } });
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
      { parse_mode: 'Markdown', reply_markup: this.mainMenu(lang) },
    );
    const kb = this.miniAppKeyboard(lang);
    if (kb) await ctx.reply(t(lang, 'menu'), { reply_markup: kb });
  }

  private async sendProfile(ctx: Context, user: any, lang: Lang) {
    return ctx.reply(
      t(lang, 'profile', {
        name: `${user.lastName} ${user.firstName}`,
        dept: user.department?.nameUz ?? '—',
        position: user.position ?? '—',
        role: user.role?.name ?? '—',
        phone: user.phone,
      }),
      { parse_mode: 'Markdown', reply_markup: this.mainMenu(lang) },
    );
  }

  private async sendTasks(ctx: Context, userId: string, lang: Lang) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 1);
    const tasks = await this.prisma.task.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { order: { select: { number: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!tasks.length) return ctx.reply(t(lang, 'no_tasks'), { reply_markup: this.mainMenu(lang) });

    const icon = { TODO: '⬜', IN_PROGRESS: '🔄', DONE: '✅', BLOCKED: '⛔' } as const;
    const body = tasks.map((x) => `${icon[x.status]} ${x.title}${x.order ? ` · ${x.order.number}` : ''}`).join('\n');
    return ctx.reply(`${t(lang, 'tasks_title')}\n\n${body}`, { parse_mode: 'Markdown', reply_markup: this.mainMenu(lang) });
  }

  private async sendPlan(ctx: Context, userId: string, lang: Lang) {
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(day); week.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const tasks = await this.prisma.task.findMany({ where: { userId, date: { gte: month } }, select: { date: true, status: true } });
    const calc = (from: Date) => {
      const t2 = tasks.filter((x) => x.date >= from);
      return { total: t2.length, done: t2.filter((x) => x.status === 'DONE').length };
    };
    const d = calc(day), w = calc(week), m = calc(month);
    return ctx.reply(
      `${t(lang, 'plan_title')}\n\n` +
        t(lang, 'plan_body', {
          d_done: d.done, d_total: d.total, w_done: w.done, w_total: w.total,
          m_done: m.done, m_total: m.total,
          progress: m.total ? Math.round((m.done / m.total) * 100) : 0,
        }),
      { parse_mode: 'Markdown', reply_markup: this.mainMenu(lang) },
    );
  }

  /** Employee picks one of the orders currently sitting in their own stage. */
  private async startReport(ctx: Context, user: any, lang: Lang) {
    const stage: StageType | undefined = user.department?.stage;
    if (!stage) return ctx.reply(t(lang, 'no_stage'), { reply_markup: this.mainMenu(lang) });

    const stages = await this.prisma.orderStage.findMany({
      where: {
        stage,
        status: { in: ['WAITING', 'IN_PROGRESS', 'DELAYED'] },
        order: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      },
      include: { order: { select: { id: true, number: true, qty: true, model: { select: { code: true } } } } },
      orderBy: { order: { deadline: 'asc' } },
      take: 20,
    });
    if (!stages.length) return ctx.reply(t(lang, 'no_orders'), { reply_markup: this.mainMenu(lang) });

    const kb = new InlineKeyboard();
    for (const s of stages) {
      const pct = s.planQty ? Math.round((s.doneQty / s.planQty) * 100) : 0;
      kb.text(`${s.order.number} · ${s.order.model?.code ?? ''} · ${s.doneQty}/${s.planQty} (${pct}%)`, `order:${s.order.id}`).row();
    }
    return ctx.reply(`${t(lang, 'choose_order')}\n\n${STAGE_LABEL[stage]}`, { reply_markup: kb });
  }

  private async handleQty(ctx: Context, s: any, user: any, lang: Lang, text: string) {
    const qty = parseInt(text.replace(/\D/g, ''), 10);
    if (!Number.isFinite(qty) || qty <= 0) return ctx.reply(t(lang, 'invalid_number'));
    const orderId = s.step.slice(4);
    await this.setStep(BigInt(ctx.from!.id), `DEFECT:${orderId}:${qty}`);
    return ctx.reply(t(lang, 'ask_defect'), { reply_markup: new Keyboard().text('0').text(t(lang, 'cancel')).resized() });
  }

  private async handleDefect(ctx: Context, s: any, user: any, lang: Lang, text: string) {
    const defect = parseInt(text.replace(/\D/g, ''), 10);
    if (!Number.isFinite(defect) || defect < 0) return ctx.reply(t(lang, 'invalid_number'));

    const [, orderId, qtyStr] = s.step.split(':');
    const qty = parseInt(qtyStr, 10);
    const stage: StageType = user.department.stage;
    const telegramId = BigInt(ctx.from!.id);

    try {
      const result = await this.production.addEntry(
        stage,
        { orderId, qty, defectQty: defect, note: 'Telegram bot' },
        {
          sub: user.id, login: user.login, roleId: user.roleId, roleCode: user.role.code,
          permissions: user.role.permissions, departmentId: user.departmentId,
          fullName: `${user.lastName} ${user.firstName}`,
        },
        'TELEGRAM',
      );
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { number: true } });
      await this.setStep(telegramId, 'READY');
      return ctx.reply(
        t(lang, 'saved', {
          order: order?.number ?? '', stage: STAGE_LABEL[stage], qty,
          defect: defect ? `, brak ${defect}` : '',
          done: result.doneQty, plan: result.planQty, progress: result.progress,
        }),
        { parse_mode: 'Markdown', reply_markup: this.mainMenu(lang) },
      );
    } catch (e) {
      await this.setStep(telegramId, 'READY');
      return ctx.reply(t(lang, 'error', { msg: (e as Error).message }), { reply_markup: this.mainMenu(lang) });
    }
  }
}
