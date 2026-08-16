import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Transform(({ value }) => parseInt(value, 10) || 1) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional() @Transform(({ value }) => parseInt(value, 10) || 20) @IsInt() @Min(1) @Max(200)
  limit = 20;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  get skip(): number { return (this.page - 1) * this.limit; }
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function paginate<T>(items: T[], total: number, dto: PaginationDto): Paginated<T> {
  return {
    items,
    total,
    page: dto.page,
    limit: dto.limit,
    pages: Math.max(1, Math.ceil(total / dto.limit)),
  };
}
