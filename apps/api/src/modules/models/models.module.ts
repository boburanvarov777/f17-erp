import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, Injectable, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ModelStatus, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { CurrentUser, JwtUser, RequirePermissions } from '../../common/decorators';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { badRequest } from '../../common/i18n/api-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  deleteStoredUrl,
  FILE_MIMES,
  MAX_FILE_BYTES,
  MAX_PHOTO_BYTES,
  PHOTO_MIMES,
  storeUpload,
} from '../../common/storage/upload';
import { buildOrderBy } from '../../common/utils/order-by';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

export class SizeDto {
  @ApiProperty() @IsString() size!: string;
  @ApiProperty() @IsNumber() qty!: number;
}
export class ColorDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hex?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photo?: string;
}
export class AccessoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() qty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() photo?: string;
}

export class CreateModelDto {
  @ApiProperty() @IsString() @MinLength(2) code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fabric?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lining?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional({ enum: ModelStatus }) @IsOptional() @IsEnum(ModelStatus) status?: ModelStatus;
  @ApiPropertyOptional({ type: [SizeDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SizeDto) sizes?: SizeDto[];
  @ApiPropertyOptional({ type: [ColorDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ColorDto) colors?: ColorDto[];
  @ApiPropertyOptional({ type: [AccessoryDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessoryDto) accessories?: AccessoryDto[];
}
export class UpdateModelDto extends PartialType(CreateModelDto) {}

export class QueryModelsDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: ModelStatus }) @IsOptional() @IsEnum(ModelStatus) status?: ModelStatus;
}

const SORTABLE = ['code', 'name', 'category', 'season', 'status', 'createdAt'];

@Injectable()
export class ModelsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  async findAll(dto: QueryModelsDto) {
    const where: Prisma.ProductModelWhereInput = { archivedAt: null };
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.category) where.category = dto.category;
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.OR = [
        { code: { contains: dto.search, mode: 'insensitive' } },
        { name: { contains: dto.search, mode: 'insensitive' } },
        { fabric: { contains: dto.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productModel.findMany({
        where, skip: dto.skip, take: dto.limit,
        orderBy: buildOrderBy(dto.sortBy, dto.sortOrder, SORTABLE, { createdAt: 'desc' }) as any,
        include: { client: { select: { id: true, name: true, code: true } }, sizes: true, photos: { orderBy: { sortOrder: 'asc' }, take: 1 }, _count: { select: { orders: true } } },
      }),
      this.prisma.productModel.count({ where }),
    ]);
    return paginate(items, total, dto);
  }

  async create(dto: CreateModelDto, actor: JwtUser) {
    const { sizes, colors, accessories, clientId, cost, photo, ...rest } = dto;
    if (photo?.startsWith('data:')) {
      throw badRequest('err_photo_after_create');
    }
    const model = await this.prisma.productModel.create({
      data: {
        ...rest,
        code: dto.code.trim().toUpperCase(),
        cost: cost != null ? new Prisma.Decimal(cost) : undefined,
        client: clientId ? { connect: { id: clientId } } : undefined,
        sizes: sizes?.length ? { create: sizes.map((s) => ({ size: s.size, qty: s.qty })) } : undefined,
        colors: colors?.length ? { create: colors } : undefined,
        accessories: accessories?.length ? { create: accessories } : undefined,
      },
      include: { sizes: true, colors: true, accessories: true, photos: { orderBy: { sortOrder: 'asc' } } },
    });
    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.MODEL_CREATED, entity: 'ProductModel', entityId: model.id, newValue: { code: model.code, name: model.name } });
    return model;
  }

  async update(id: string, dto: UpdateModelDto, actor: JwtUser) {
    const existing = await this.prisma.productModel.findUniqueOrThrow({ where: { id }, include: { sizes: true } });
    const { sizes, colors, accessories, clientId, cost, code, photo, ...rest } = dto;
    if (photo?.startsWith('data:')) {
      throw badRequest('err_photo_separate');
    }

    const model = await this.prisma.$transaction(async (tx) => {
      if (sizes) {
        await tx.modelSize.deleteMany({ where: { modelId: id } });
        if (sizes.length) await tx.modelSize.createMany({ data: sizes.map((s) => ({ modelId: id, size: s.size, qty: s.qty })) });
      }
      if (colors) {
        await tx.modelColor.deleteMany({ where: { modelId: id } });
        if (colors.length) await tx.modelColor.createMany({ data: colors.map((c) => ({ ...c, modelId: id })) });
      }
      if (accessories) {
        await tx.accessory.deleteMany({ where: { modelId: id } });
        if (accessories.length) await tx.accessory.createMany({ data: accessories.map((a) => ({ ...a, modelId: id })) });
      }
      return tx.productModel.update({
        where: { id },
        data: {
          ...rest,
          ...(code ? { code: code.trim().toUpperCase() } : {}),
          cost: cost != null ? new Prisma.Decimal(cost) : undefined,
          ...(clientId !== undefined ? { client: clientId ? { connect: { id: clientId } } : { disconnect: true } } : {}),
        },
        include: { sizes: true, colors: true, accessories: true, client: true, photos: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    this.audit.log({ userId: actor.sub, action: AUDIT_ACTIONS.MODEL_UPDATED, entity: 'ProductModel', entityId: id, oldValue: { name: existing.name }, newValue: dto });
    return model;
  }

  findOne(id: string) {
    return this.prisma.productModel.findFirstOrThrow({
      where: { OR: [{ id }, { code: id }] },
      include: {
        client: true, sizes: { orderBy: { size: 'asc' } }, colors: true, accessories: true, files: true,
        photos: { orderBy: { sortOrder: 'asc' } },
        orders: {
          where: { archivedAt: null },
          select: { id: true, number: true, qty: true, status: true, deadline: true, orderDate: true },
          orderBy: { orderDate: 'desc' }, take: 50,
        },
      },
    }).then(async (model) => {
      if (model.photo && !model.photos.length) {
        const legacy = await this.prisma.modelPhoto.create({
          data: { modelId: model.id, url: model.photo, sortOrder: 0 },
        });
        model.photos = [legacy];
      }
      return model;
    });
  }

  private async syncCoverPhoto(modelId: string) {
    const first = await this.prisma.modelPhoto.findFirst({ where: { modelId }, orderBy: { sortOrder: 'asc' } });
    await this.prisma.productModel.update({ where: { id: modelId }, data: { photo: first?.url ?? null } });
  }

  async addPhoto(modelId: string, file: { mimetype: string; size: number; buffer: Buffer; originalname?: string }) {
    await this.prisma.productModel.findUniqueOrThrow({ where: { id: modelId } });
    const stored = await storeUpload(this.storage, file, `models/${modelId}/photos`, {
      maxBytes: MAX_PHOTO_BYTES,
      allowed: PHOTO_MIMES,
      kind: 'photo',
    });
    const count = await this.prisma.modelPhoto.count({ where: { modelId } });
    const photo = await this.prisma.modelPhoto.create({ data: { modelId, url: stored.url, sortOrder: count } });
    if (count === 0) await this.prisma.productModel.update({ where: { id: modelId }, data: { photo: stored.url } });
    return photo;
  }

  async removePhoto(photoId: string) {
    const photo = await this.prisma.modelPhoto.delete({ where: { id: photoId } });
    await deleteStoredUrl(this.storage, photo.url);
    await this.syncCoverPhoto(photo.modelId);
    return { success: true };
  }

  /** Models are always soft-archived so they appear in the Archive module. */
  async archive(id: string, actor: JwtUser) {
    const model = await this.prisma.productModel.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    await this.prisma.productModel.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    this.audit.log({
      userId: actor.sub,
      action: AUDIT_ACTIONS.MODEL_ARCHIVED,
      entity: 'ProductModel',
      entityId: id,
      newValue: { ordersLinked: model._count.orders },
    });
    return { success: true, ordersLinked: model._count.orders };
  }

  async addFile(
    id: string,
    file: { mimetype: string; size: number; buffer: Buffer; originalname?: string },
  ) {
    await this.prisma.productModel.findUniqueOrThrow({ where: { id } });
    const stored = await storeUpload(this.storage, file, `models/${id}/files`, {
      maxBytes: MAX_FILE_BYTES,
      allowed: FILE_MIMES,
      kind: 'file',
    });
    return this.prisma.modelFile.create({
      data: { modelId: id, name: stored.name, url: stored.url, mime: stored.mime, size: stored.size },
    });
  }

  async removeFile(fileId: string) {
    const file = await this.prisma.modelFile.findUniqueOrThrow({ where: { id: fileId } });
    await deleteStoredUrl(this.storage, file.url);
    await this.prisma.modelFile.delete({ where: { id: fileId } });
    return { success: true };
  }

  uploadTempPhoto(file: { mimetype: string; size: number; buffer: Buffer; originalname?: string }) {
    return storeUpload(this.storage, file, 'models/temp/photos', {
      maxBytes: MAX_PHOTO_BYTES,
      allowed: PHOTO_MIMES,
      kind: 'photo',
    });
  }
}

@ApiTags('models')
@ApiBearerAuth()
@Controller('models')
export class ModelsController {
  constructor(private service: ModelsService) {}

  @Get() @RequirePermissions('models.read')
  findAll(@Query() dto: QueryModelsDto) { return this.service.findAll(dto); }

  @Post('upload-photo')
  @RequirePermissions('models.create', 'models.update')
  @ApiOperation({ summary: 'Upload model photo — stored in bucket when configured' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async uploadPhoto(@UploadedFile() file?: { mimetype: string; size: number; buffer: Buffer; originalname?: string }) {
    if (!file) throw badRequest('err_no_image');
    const stored = await this.service.uploadTempPhoto(file);
    return { photo: stored.url };
  }

  @Post(':id/photos')
  @RequirePermissions('models.create', 'models.update')
  @ApiOperation({ summary: 'Attach photo to model (multipart, max 2 MB)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  addPhoto(@Param('id') id: string, @UploadedFile() file?: { mimetype: string; size: number; buffer: Buffer }) {
    if (!file) throw badRequest('err_no_image');
    return this.service.addPhoto(id, file);
  }

  @Delete('photos/:photoId')
  @RequirePermissions('models.update')
  removePhoto(@Param('photoId') photoId: string) { return this.service.removePhoto(photoId); }

  @Get(':id') @RequirePermissions('models.read')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() @RequirePermissions('models.create')
  create(@Body() dto: CreateModelDto, @CurrentUser() actor: JwtUser) { return this.service.create(dto, actor); }

  @Patch(':id') @RequirePermissions('models.update')
  update(@Param('id') id: string, @Body() dto: UpdateModelDto, @CurrentUser() actor: JwtUser) { return this.service.update(id, dto, actor); }

  @Delete(':id')
  @RequirePermissions('models.delete')
  @ApiOperation({ summary: 'Archive model (physical delete only when no order references it)' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtUser) { return this.service.archive(id, actor); }

  @Post(':id/files')
  @RequirePermissions('models.update')
  @ApiOperation({ summary: 'Upload model file (PDF, Word, Excel, ZIP, images — max 25 MB)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  uploadFile(@Param('id') id: string, @UploadedFile() file?: { mimetype: string; size: number; buffer: Buffer; originalname?: string }) {
    if (!file) throw badRequest('err_no_file');
    return this.service.addFile(id, file);
  }

  @Delete('files/:fileId') @RequirePermissions('models.update')
  removeFile(@Param('fileId') fileId: string) { return this.service.removeFile(fileId); }
}

@Module({ controllers: [ModelsController], providers: [ModelsService], exports: [ModelsService] })
export class ModelsModule {}
