import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message:
      'Senha deve ter mínimo 8 caracteres, com letra maiúscula, minúscula, número e símbolo especial',
  })
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
