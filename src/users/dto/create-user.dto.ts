import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

  @IsEnum(Role)
  role!: Role;
}
