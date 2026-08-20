import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { CreateDefectDto, CreateEntryDto, QueryStageDto, UpdateStageDto, UpsertShipmentDto } from './dto';
import { ProductionService } from './production.service';

@ApiTags('production')
@ApiBearerAuth()
@Controller('production')
export class ProductionController {
  constructor(private production: ProductionService) {}

  @Get('summary')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Per-stage plan/actual/defect totals' })
  summary() { return this.production.summary(); }

  @Get('shipments')
  @RequirePermissions('loading.read')
  shipments(@Query('orderId') orderId?: string) { return this.production.shipments(orderId); }

  @Post('shipments')
  @RequirePermissions('loading.create')
  createShipment(@Body() dto: UpsertShipmentDto, @CurrentUser() actor: JwtUser) {
    return this.production.upsertShipment(dto, actor);
  }

  @Patch('shipments/:id')
  @RequirePermissions('loading.update')
  updateShipment(@Param('id') id: string, @Body() dto: UpsertShipmentDto, @CurrentUser() actor: JwtUser) {
    return this.production.upsertShipment(dto, actor, id);
  }

  @Post('defects')
  defect(@Body() dto: CreateDefectDto, @CurrentUser() actor: JwtUser) {
    return this.production.addDefect(dto, actor);
  }

  @Patch('stages/:stageId')
  updateStage(@Param('stageId') stageId: string, @Body() dto: UpdateStageDto, @CurrentUser() actor: JwtUser) {
    return this.production.updateStage(stageId, dto, actor);
  }

  @Post('entries/:entryId/cancel')
  @ApiOperation({ summary: 'Reversal — the original entry is kept for history' })
  cancelEntry(@Param('entryId') entryId: string, @CurrentUser() actor: JwtUser) {
    return this.production.cancelEntry(entryId, actor);
  }

  @Get(':stage')
  @ApiParam({ name: 'stage', enum: ['cutting', 'sewing', 'washing', 'laser', 'packing', 'loading'] })
  list(@Param('stage') stage: string, @Query() dto: QueryStageDto, @CurrentUser() actor: JwtUser) {
    return this.production.list(this.production.resolveStage(stage), dto, actor);
  }

  @Get(':stage/:orderId')
  detail(@Param('stage') stage: string, @Param('orderId') orderId: string, @CurrentUser() actor: JwtUser) {
    return this.production.detail(this.production.resolveStage(stage), orderId, actor);
  }

  @Post(':stage/entries')
  @ApiOperation({ summary: 'Record a production operation for this stage' })
  addEntry(@Param('stage') stage: string, @Body() dto: CreateEntryDto, @CurrentUser() actor: JwtUser) {
    return this.production.addEntry(this.production.resolveStage(stage), dto, actor, dto.source ?? 'WEB');
  }
}
