import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { BotService } from './bot.service';
import { MiniAppService } from './miniapp.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [AuthModule],
  controllers: [TelegramController],
  providers: [BotService, MiniAppService],
  exports: [BotService],
})
export class TelegramModule {}
