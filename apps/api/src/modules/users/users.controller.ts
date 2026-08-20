import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get() @RequirePermissions('users.read')
  findAll(@Query() dto: QueryUsersDto, @CurrentUser() actor: JwtUser) {
    return this.users.findAll(dto, actor);
  }

  @Get('monitoring')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Employee task/plan monitoring board' })
  monitoring(@CurrentUser() actor: JwtUser, @Query('departmentId') departmentId?: string) {
    return this.users.monitoring(actor, departmentId);
  }

  @Get(':id') @RequirePermissions('users.read')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.users.findOne(id, actor);
  }

  @Post() @RequirePermissions('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id') @RequirePermissions('users.update')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: JwtUser) {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/block') @RequirePermissions('users.update')
  block(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.users.setStatus(id, 'BLOCKED', actor);
  }

  @Post(':id/activate') @RequirePermissions('users.update')
  activate(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.users.setStatus(id, 'ACTIVE', actor);
  }

  @Delete(':id')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Archive user (soft) — Super Admin / Super Pro Admin; root user is protected' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.users.setStatus(id, 'ARCHIVED', actor);
  }

  @Post(':id/reset-password') @RequirePermissions('users.update')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: JwtUser) {
    return this.users.resetPassword(id, dto.newPassword, actor);
  }

  @Post(':id/unlink-telegram') @RequirePermissions('users.update')
  unlinkTelegram(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.users.unlinkTelegram(id, actor);
  }
}
