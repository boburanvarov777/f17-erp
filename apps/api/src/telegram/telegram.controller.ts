import { All, Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { BotService } from './bot.service';
import { MiniAppService } from './miniapp.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private bot: BotService, private miniApp: MiniAppService) {}

  @Public()
  @All('webhook')
  @ApiOperation({ summary: 'Telegram webhook endpoint (secret-token protected)' })
  async webhook(@Req() req: Request, @Res() res: Response) {
    const handler = this.bot.webhook();
    if (!handler) return res.status(503).json({ message: 'Bot not configured' });
    return handler(req, res);
  }

  @Public()
  @Post('mini-app/auth')
  @ApiOperation({ summary: 'Exchange verified Telegram initData for ERP tokens' })
  auth(@Body() body: { initData: string }, @Req() req: Request) {
    return this.miniApp.authenticate(body.initData, { ip: req.ip, device: req.headers['user-agent'] as string });
  }

  @Public()
  @Post('mini-app/login')
  @ApiOperation({ summary: 'Mini App login: department + login + password, bound to the Telegram identity' })
  login(
    @Body() body: { initData: string; login: string; password: string; departmentCode?: string },
    @Req() req: Request,
  ) {
    return this.miniApp.loginWithCredentials(body.initData, body.login, body.password, body.departmentCode, {
      ip: req.ip,
      device: req.headers['user-agent'] as string,
    });
  }
}
