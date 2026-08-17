import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OrderStatus, Priority } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OrderSizeDto {
  @ApiProperty() @IsString() size!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiProperty() @IsInt() @Min(0) qty!: number;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() @MinLength(2) number!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modelId?: string;
  @ApiProperty() @IsInt() @Min(1) qty!: number;
  @ApiProperty() @IsDateString() orderDate!: string;
  @ApiProperty() @IsDateString() deadline!: string;
  @ApiPropertyOptional({ enum: Priority }) @IsOptional() @IsEnum(Priority) priority?: Priority;
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleId?: string;
  @ApiPropertyOptional({ type: [OrderSizeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderSizeDto)
  sizes?: OrderSizeDto[];

  @ApiPropertyOptional({ description: 'PENDING | SENT | APPROVED | REJECTED' })
  @IsOptional() @IsString() sampleStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() sampleSentAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() sampleApprovedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sampleNote?: string;
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class QueryOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional({ enum: Priority }) @IsOptional() @IsEnum(Priority) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsibleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ description: 'true = include archived' }) @IsOptional() @IsString() archived?: string;
}

export class CommentDto {
  @ApiProperty() @IsString() @MinLength(1) text!: string;
}
