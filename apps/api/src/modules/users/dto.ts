import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Lang, UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName!: string;

  @ApiProperty({ example: '+998901234567' })
  @Matches(/^\+?\d{9,15}$/, { message: 'Telefon raqami noto‘g‘ri formatda' })
  phone!: string;

  @ApiProperty() @IsString() @MinLength(3) login!: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() position?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() roleId!: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @ApiPropertyOptional({ enum: Lang }) @IsOptional() @IsEnum(Lang) lang?: Lang;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(6) newPassword!: string;
}

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roleId?: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
