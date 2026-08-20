import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private ctx(req: Request) {
    return { ip: req.ip, device: req.headers['user-agent'] as string };
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with login + password (optionally scoped to a department)' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.ctx(req));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, this.ctx(req));
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser('sub') userId: string, @Body() dto: Partial<RefreshDto>, @Req() req: Request) {
    return this.auth.logout(userId, dto?.refreshToken, this.ctx(req));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}
