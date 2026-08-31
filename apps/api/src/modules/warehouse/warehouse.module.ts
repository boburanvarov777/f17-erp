import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Prisma, StockOp } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { badRequest } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildOrderBy, dateRange } from '../../common/utils/order-by';
import { AuditService } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';

export class CreateMaterialDto {
  @ApiProperty() @IsString() @MinLength(1) code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ default: 'm' }) @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() minStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
  @ApiPropertyOptional({ description: 'Opening balance — recorded as an INVENTORY transaction' })
  @IsOptional() @IsNumber() quantity?: number;
}
export class UpdateMaterialDto extends PartialType(CreateMaterialDto) {}

export class StockOpDto {
  @ApiProperty() @IsString() materialId!: string;
  @ApiProperty({ enum: StockOp }) @IsEnum(StockOp) op!: StockOp;
  @ApiProperty({ example: 150.5 }) @IsNumber() qty!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() qty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

const SORTABLE = ['code', 'name', 'category', 'stock', 'reserved', 'minStock', 'createdAt'];

@Injectable()
export class WarehouseService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  async list(dto: PaginationDto, category?: string, status?: string, asOf?: string) {
    const end = asOf?.trim() ? this.endOfDay(asOf.trim()) : null;
    const historical = !!end && !this.isToday(asOf!.trim());

    const where: Prisma.MaterialWhereInput = { archivedAt: null };
    if (end) where.createdAt = { lte: end };
    if (category) where.category = category;
    if (dto.search) {
      where.OR = [
        { code: { contains: dto.search, mode: 'insensitive' } },
        { name: { contains: dto.search, mode: 'insensitive' } },
        { supplier: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    if (historical) {
      const all = await this.prisma.material.findMany({
        where,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { createdAt: 'desc' }) as any,
      });
      const snapshots = await this.snapshotForMaterials(all.map((m) => m.id), end!);
      let rows = all.map((m) => this.decorate(m, snapshots.get(m.id)));
      if (status) rows = rows.filter((m) => m.status === status);
      const total = rows.length;
      const items = rows.slice(dto.skip, dto.skip + dto.limit);
      const dated = await this.attachLastTxDates(items, end!);
      return { ...paginate(dated, total, dto), asOf: asOf!.trim() };
    }

    if (status) where.status = status as any;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.material.findMany({
        where, skip: dto.skip, take: dto.limit,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { createdAt: 'desc' }) as any,
      }),
      this.prisma.material.count({ where }),
    ]);
    return paginate(await this.attachLastTxDates(items.map((m) => this.decorate(m))), total, dto);
  }

  private async attachLastTxDates<T extends { id: string }>(items: T[], before?: Date): Promise<(T & { lastTxAt: string | null })[]> {
    if (!items.length) return [];
    const ids = items.map((m) => m.id);
    const grouped = await this.prisma.stockTransaction.groupBy({
      by: ['materialId'],
      where: { materialId: { in: ids }, ...(before ? { createdAt: { lte: before } } : {}) },
      _max: { createdAt: true },
    });
    const map = new Map(grouped.map((g) => [g.materialId, g._max.createdAt?.toISOString() ?? null]));
    return items.map((m) => ({ ...m, lastTxAt: map.get(m.id) ?? null }));
  }

  private decorate(m: any, snap?: { stock: number; reserved: number }) {
    const stock = snap ? snap.stock : Number(m.stock);
    const reserved = snap ? snap.reserved : Number(m.reserved);
    const minStock = Number(m.minStock);
    const available = stock - reserved;
    const status = stock <= 0 ? 'OUT' : stock <= minStock ? 'LOW' : 'OK';
    return {
      ...m,
      stock,
      reserved,
      minStock,
      available,
      status,
      price: m.price ? Number(m.price) : null,
    };
  }

  private endOfDay(dateStr: string): Date {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) throw badRequest('v_date', { field: 'date' });
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private isToday(dateStr: string): boolean {
    const iso = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return iso(new Date(dateStr)) === iso(new Date());
  }

  private applyOp(stock: number, reserved: number, op: StockOp, qty: number) {
    switch (op) {
      case 'IN': return { stock: stock + qty, reserved };
      case 'OUT':
        if (stock - reserved < qty) throw badRequest('err_stock_insufficient', { available: stock - reserved, unit: '—' });
        return { stock: stock - qty, reserved };
      case 'RESERVE':
        if (stock - reserved < qty) throw badRequest('err_reserve_insufficient', { available: stock - reserved, unit: '—' });
        return { stock, reserved: reserved + qty };
      case 'RETURN': return { stock: stock + qty, reserved: Math.max(0, reserved - qty) };
      case 'INVENTORY': return { stock: qty, reserved };
      default: return { stock, reserved };
    }
  }

  /** Replay ledger and sync balances on every row + material totals. */
  private async rebuildMaterialBalances(client: Prisma.TransactionClient, materialId: string) {
    const material = await client.material.findUniqueOrThrow({ where: { id: materialId } });
    const txs = await client.stockTransaction.findMany({
      where: { materialId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let stock = 0;
    let reserved = 0;
    for (const row of txs) {
      const qty = Number(row.qty);
      ({ stock, reserved } = this.applyOp(stock, reserved, row.op, qty));
      await client.stockTransaction.update({
        where: { id: row.id },
        data: { balance: new Prisma.Decimal(stock) },
      });
    }

    const minStock = Number(material.minStock);
    const status = stock <= 0 ? 'OUT' : stock <= minStock ? 'LOW' : 'OK';
    await client.material.update({
      where: { id: materialId },
      data: { stock: new Prisma.Decimal(stock), reserved: new Prisma.Decimal(reserved), status },
    });
    return { stock, reserved, status };
  }

  private async snapshotForMaterials(materialIds: string[], end: Date) {
    const map = new Map<string, { stock: number; reserved: number }>();
    if (!materialIds.length) return map;
    for (const id of materialIds) map.set(id, { stock: 0, reserved: 0 });

    const txs = await this.prisma.stockTransaction.findMany({
      where: { materialId: { in: materialIds }, createdAt: { lte: end } },
      orderBy: [{ materialId: 'asc' }, { createdAt: 'asc' }],
      select: { materialId: true, op: true, qty: true },
    });

    for (const tx of txs) {
      const s = map.get(tx.materialId)!;
      const qty = Number(tx.qty);
      try {
        ({ stock: s.stock, reserved: s.reserved } = this.applyOp(s.stock, s.reserved, tx.op, qty));
      } catch {
        // ignore inconsistent historical rows
      }
    }
    return map;
  }

  async create(dto: CreateMaterialDto, actor: JwtUser) {
    const material = await this.prisma.$transaction(async (tx) => {
      const m = await tx.material.create({
        data: {
          code: dto.code.trim().toUpperCase(), name: dto.name, category: dto.category,
          unit: dto.unit ?? 'm',
          minStock: new Prisma.Decimal(dto.minStock ?? 0),
          supplier: dto.supplier,
          price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
          stock: new Prisma.Decimal(dto.quantity ?? 0),
        },
      });
      if (dto.quantity) {
        await tx.stockTransaction.create({
          data: { materialId: m.id, op: 'INVENTORY', qty: new Prisma.Decimal(dto.quantity), balance: new Prisma.Decimal(dto.quantity), userId: actor.sub, note: 'Boshlang‘ich qoldiq' },
        });
      }
      return m;
    });
    this.audit.log({ userId: actor.sub, action: 'MATERIAL_CREATED', entity: 'Material', entityId: material.id, newValue: dto });
    return this.decorate(material);
  }

  async update(id: string, dto: UpdateMaterialDto, actor: JwtUser) {
    if ((dto as any).quantity != null) {
      throw badRequest('err_stock_direct_edit');
    }
    const m = await this.prisma.material.update({
      where: { id },
      data: {
        name: dto.name, category: dto.category, unit: dto.unit, supplier: dto.supplier,
        minStock: dto.minStock != null ? new Prisma.Decimal(dto.minStock) : undefined,
        price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
      },
    });
    this.audit.log({ userId: actor.sub, action: 'MATERIAL_UPDATED', entity: 'Material', entityId: id, newValue: dto });
    return this.decorate(m);
  }

  async archive(id: string, actor: JwtUser) {
    await this.prisma.material.update({ where: { id }, data: { archivedAt: new Date() } });
    this.audit.log({ userId: actor.sub, action: 'MATERIAL_ARCHIVED', entity: 'Material', entityId: id });
    return { success: true };
  }

  /**
   * Every balance change goes through a transaction with the resulting balance
   * stored on the row, so the ledger can always be replayed and audited.
   */
  async operate(dto: StockOpDto, actor: JwtUser) {
    if (dto.qty <= 0 && dto.op !== 'INVENTORY') throw badRequest('err_qty_positive');

    const result = await this.prisma.$transaction(async (tx) => {
      const m = await tx.material.findUniqueOrThrow({ where: { id: dto.materialId } });
      const stock = Number(m.stock);
      const reserved = Number(m.reserved);
      let newStock = stock;
      let newReserved = reserved;

      switch (dto.op) {
        case 'IN': newStock = stock + dto.qty; break;
        case 'OUT':
          if (stock - reserved < dto.qty) throw badRequest('err_stock_insufficient', { available: stock - reserved, unit: m.unit });
          newStock = stock - dto.qty; break;
        case 'RESERVE':
          if (stock - reserved < dto.qty) throw badRequest('err_reserve_insufficient', { available: stock - reserved, unit: m.unit });
          newReserved = reserved + dto.qty; break;
        case 'RETURN':
          newStock = stock + dto.qty;
          newReserved = Math.max(0, reserved - dto.qty); break;
        case 'INVENTORY': newStock = dto.qty; break;
      }

      const status = newStock <= 0 ? 'OUT' : newStock <= Number(m.minStock) ? 'LOW' : 'OK';
      const updated = await tx.material.update({
        where: { id: m.id },
        data: { stock: new Prisma.Decimal(newStock), reserved: new Prisma.Decimal(newReserved), status },
      });
      const trx = await tx.stockTransaction.create({
        data: {
          materialId: m.id, op: dto.op,
          qty: new Prisma.Decimal(dto.qty), balance: new Prisma.Decimal(newStock),
          orderId: dto.orderId || null, userId: actor.sub, note: dto.note,
        },
      });
      return { material: updated, trx, status };
    });

    this.audit.log({
      userId: actor.sub, action: `WAREHOUSE_${dto.op}`, entity: 'Material', entityId: dto.materialId,
      newValue: { op: dto.op, qty: dto.qty, balance: Number(result.material.stock) },
    });

    if (result.status !== 'OK') {
      await this.notifications.broadcast({
        type: 'STOCK_LOW',
        title: `Ombor: ${result.material.name} ${result.status === 'OUT' ? 'tugadi' : 'kam qoldi'}`,
        body: `Qoldiq: ${Number(result.material.stock)} ${result.material.unit} (min ${Number(result.material.minStock)})`,
        link: '/warehouse',
      });
    }
    return this.decorate(result.material);
  }

  async transactions(materialId?: string, dto?: PaginationDto, from?: string, to?: string) {
    const p = dto ?? Object.assign(new PaginationDto(), { page: 1, limit: 50, sortOrder: 'desc' as const });
    const range = dateRange(from, to);
    const where: Prisma.StockTransactionWhereInput = {
      ...(materialId ? { materialId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockTransaction.findMany({
        where, skip: p.skip, take: p.limit, orderBy: { createdAt: 'desc' },
        include: {
          material: { select: { code: true, name: true, unit: true } },
          user: { select: { firstName: true, lastName: true } },
          order: { select: { number: true } },
        },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);
    return paginate(items.map((t) => ({ ...t, qty: Number(t.qty), balance: Number(t.balance) })), total, p);
  }

  async updateTransaction(txId: string, dto: UpdateTransactionDto, actor: JwtUser) {
    if (dto.qty != null && dto.qty <= 0) throw badRequest('err_qty_positive');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stockTransaction.findUniqueOrThrow({ where: { id: txId } });
      await tx.stockTransaction.update({
        where: { id: txId },
        data: {
          ...(dto.qty != null ? { qty: new Prisma.Decimal(dto.qty) } : {}),
          ...(dto.note !== undefined ? { note: dto.note || null } : {}),
        },
      });
      await this.rebuildMaterialBalances(tx, row.materialId);
      return tx.stockTransaction.findUniqueOrThrow({
        where: { id: txId },
        include: {
          material: { select: { code: true, name: true, unit: true } },
          user: { select: { firstName: true, lastName: true } },
          order: { select: { number: true } },
        },
      });
    });

    this.audit.log({
      userId: actor.sub, action: 'WAREHOUSE_TX_UPDATED', entity: 'StockTransaction', entityId: txId, newValue: dto,
    });
    return { ...updated, qty: Number(updated.qty), balance: Number(updated.balance) };
  }

  async deleteTransaction(txId: string, actor: JwtUser) {
    const materialId = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stockTransaction.findUniqueOrThrow({ where: { id: txId } });
      await tx.stockTransaction.delete({ where: { id: txId } });
      await this.rebuildMaterialBalances(tx, row.materialId);
      return row.materialId;
    });

    this.audit.log({
      userId: actor.sub, action: 'WAREHOUSE_TX_DELETED', entity: 'StockTransaction', entityId: txId,
      newValue: { materialId },
    });
    return { success: true };
  }
}

@ApiTags('warehouse')
@ApiBearerAuth()
@Controller('warehouse')
export class WarehouseController {
  constructor(private service: WarehouseService) {}

  @Get() @RequirePermissions('warehouse.read')
  list(
    @Query() dto: PaginationDto,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.list(dto, category, status, asOf);
  }

  @Get('transactions') @RequirePermissions('warehouse.read')
  transactions(
    @Query('materialId') materialId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query() dto?: PaginationDto,
  ) {
    return this.service.transactions(materialId, dto, from, to);
  }

  @Patch('transactions/:txId')
  @RequirePermissions('warehouse.update')
  @ApiOperation({ summary: 'Edit transaction qty/note and rebuild material balances' })
  updateTransaction(@Param('txId') txId: string, @Body() dto: UpdateTransactionDto, @CurrentUser() actor: JwtUser) {
    return this.service.updateTransaction(txId, dto, actor);
  }

  @Delete('transactions/:txId')
  @RequirePermissions('warehouse.update')
  @ApiOperation({ summary: 'Delete transaction and rebuild material balances' })
  deleteTransaction(@Param('txId') txId: string, @CurrentUser() actor: JwtUser) {
    return this.service.deleteTransaction(txId, actor);
  }

  @Post() @RequirePermissions('warehouse.create')
  create(@Body() dto: CreateMaterialDto, @CurrentUser() actor: JwtUser) { return this.service.create(dto, actor); }

  @Patch(':id') @RequirePermissions('warehouse.update')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto, @CurrentUser() actor: JwtUser) { return this.service.update(id, dto, actor); }

  @Delete(':id')
  @RequirePermissions('warehouse.update')
  @ApiOperation({ summary: 'Archive material — preserved in Archive module' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.service.archive(id, actor); }

  @Post('operations')
  @RequirePermissions('warehouse.update')
  @ApiOperation({ summary: 'Kirim / Chiqim / Rezerv / Qaytarish / Inventarizatsiya — transactional' })
  operate(@Body() dto: StockOpDto, @CurrentUser() actor: JwtUser) { return this.service.operate(dto, actor); }
}

@Module({
  imports: [NotificationsModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
