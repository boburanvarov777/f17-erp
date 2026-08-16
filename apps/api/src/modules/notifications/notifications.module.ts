import { Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  list(@CurrentUser('sub') userId: string, @Query('unread') unread?: string) {
    return this.service.list(userId, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('sub') userId: string) { return this.service.unreadCount(userId); }

  @Post(':id/read')
  markRead(@Param('id') id: string) { return this.service.markRead(id); }

  @Post('read-all')
  markAllRead(@CurrentUser('sub') userId: string) { return this.service.markAllRead(userId); }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
