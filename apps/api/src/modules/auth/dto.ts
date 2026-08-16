import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' }) @IsString() @IsNotEmpty()
  login!: string;

  @ApiProperty({ example: 'Admin!2026' }) @IsString() @MinLength(4)
  password!: string;

  @ApiPropertyOptional({ description: 'Mini App: department code the employee signs in for' })
  @IsOptional() @IsString()
  departmentCode?: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty() @IsString() @MinLength(6)
  newPassword!: string;
}
