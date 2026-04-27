import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Role } from '@prisma/client';
import { RegisterCompanyDto } from './register-company.dto';
import { RegisterUserType } from './register-user-type.enum';

export class RegisterDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message:
      'Senha deve ter mínimo 8 caracteres, com letra maiúscula, minúscula, número e símbolo especial',
  })
  @MaxLength(128)
  password!: string;

  /** When set, drives registration flow (CLIENTE + company vs COLLABORATOR + code). */
  @IsOptional()
  @IsEnum(RegisterUserType)
  userType?: RegisterUserType;

  /** Required when userType is COLLABORATOR. */
  @ValidateIf((o: RegisterDto) => o.userType === RegisterUserType.COLLABORATOR)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  companyCode?: string;

  /** Optional: only when userType is CLIENTE and company data is sent (e.g. legacy onboarding). */
  @ValidateIf((o: RegisterDto) => Boolean(o.userType === RegisterUserType.CLIENTE && o.company))
  @ValidateNested()
  @Type(() => RegisterCompanyDto)
  company?: RegisterCompanyDto;

  /** Legacy: used only when userType is omitted. */
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
