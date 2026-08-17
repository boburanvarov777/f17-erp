import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus, StageStatus, StageType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryStageDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StageStatus }) @IsOptional() @IsEnum(StageStatus) status?: StageStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}

export class CreateEntryDto {
  @ApiProperty({ description: 'Order id' }) @IsString() orderId!: string;
  @ApiProperty({ example: 120 }) @IsInt() @Min(0) qty!: number;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @IsInt() @Min(0) defectQty?: number;
  @ApiProperty({ description: 'Operation date (ISO date string)' }) @IsDateString() date!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({
    description:
      'Stage-specific payload. WASHING: {batch,washingType,sentDate,returnedDate}; LASER: {machine,operator,design}; PACKING: {boxCount,subStage}; LOADING: {vehicle,driver,boxCount}',
  })
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class UpdateStageDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) planQty?: number;
  @ApiPropertyOptional({ enum: StageStatus }) @IsOptional() @IsEnum(StageStatus) status?: StageStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class CreateDefectDto {
  @ApiProperty() @IsString() orderId!: string;
  @ApiProperty({ enum: StageType }) @IsEnum(StageType) stage!: StageType;
  @ApiProperty({ example: 'Tikuv braki' }) @IsString() type!: string;
  @ApiProperty() @IsInt() @Min(1) qty!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
}

export class UpsertShipmentDto {
  @ApiProperty() @IsString() orderId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driver?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) qty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) boxCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() loadingDate?: string;
  @ApiPropertyOptional({ enum: ShipmentStatus }) @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() document?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trackNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
