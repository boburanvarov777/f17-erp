import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { CommentDto, CreateOrderDto, QueryOrdersDto, UpdateOrderDto } from './dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Get() @RequirePermissions('orders.read')
  findAll(@Query() dto: QueryOrdersDto) { return this.orders.findAll(dto); }

  @Get('schedule')
  @RequirePermissions('schedule.read', 'orders.read')
  @ApiOperation({ summary: 'Gantt/schedule feed (day / week / month views)' })
  schedule(@Query('from') from?: string, @Query('to') to?: string) { return this.orders.schedule(from, to); }

  @Get('export')
  @RequirePermissions('orders.read')
  @ApiOperation({ summary: 'CSV export of the current order list' })
  async export(@Query() dto: QueryOrdersDto, @Res() res: Response) {
    const data = await this.orders.findAll({ ...dto, page: 1, limit: 200, skip: 0 } as QueryOrdersDto);
    const head = ['Zakaz', 'Client', 'Model', 'Miqdor', 'Bajarilgan', 'Qolgan', 'Zakaz sanasi', 'Deadline', 'Status', 'Progress %'];
    const rows = data.items.map((o: any) => [
      o.number, o.client?.name ?? '', o.model ? `${o.model.code} ${o.model.name}` : '',
      o.qty, o.completedQty, o.remainingQty,
      o.orderDate.toISOString().slice(0, 10), o.deadline.toISOString().slice(0, 10), o.status, o.progress,
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send('﻿' + csv);
  }

  @Get(':id') @RequirePermissions('orders.read')
  findOne(@Param('id') id: string) { return this.orders.findOne(id); }

  @Get(':id/history') @RequirePermissions('orders.read')
  history(@Param('id') id: string) { return this.orders.history(id); }

  @Post() @RequirePermissions('orders.create')
  create(@Body() dto: CreateOrderDto, @CurrentUser() actor: JwtUser) { return this.orders.create(dto, actor); }

  @Patch(':id') @RequirePermissions('orders.update')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() actor: JwtUser) { return this.orders.update(id, dto, actor); }

  @Post(':id/cancel') @RequirePermissions('orders.update')
  cancel(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.orders.cancel(id, actor); }

  @Delete(':id')
  @RequirePermissions('orders.delete')
  @ApiOperation({ summary: 'Archive order — production data is preserved' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.orders.archive(id, actor); }

  @Post(':id/restore') @RequirePermissions('orders.delete')
  restore(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.orders.restore(id, actor); }

  @Post(':id/comments') @RequirePermissions('orders.read')
  comment(@Param('id') id: string, @Body() dto: CommentDto, @CurrentUser() actor: JwtUser) {
    return this.orders.addComment(id, dto.text, actor);
  }
}
