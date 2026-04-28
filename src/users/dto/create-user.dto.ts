import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @MinLength(8, { message: 'Senha deve ter pelo menos 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message: 'Senha deve conter: maiúscula, minúscula, número e símbolo especial (@$!%*?&#)',
  })
  @MaxLength(128)
  password!: string;

  @IsEnum(Role)
  role!: Role;
}
