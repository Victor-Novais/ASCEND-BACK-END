import { CompanySize } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Company payload when registering as CLIENTE (owner). */
export class RegisterCompanyDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(120)
  segment!: string;

  @IsOptional()
  @IsEnum(CompanySize)
  size?: CompanySize;

  @IsString()
  @MaxLength(160)
  responsible!: string;

  @IsEmail()
  @MaxLength(255)
  responsibleEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  responsiblePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evaluatorIds?: string[];
}
