import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(Role)
  role!: Role;
}
