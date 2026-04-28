import { ActionPlanPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateActionPlanDto {
  @Type(() => Number)
  @IsNumber()
  assessmentId!: number;

  @Type(() => Number)
  @IsNumber()
  companyId!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsString()
  @IsIn(['GOVERNANCA', 'SEGURANCA', 'PROCESSOS', 'INFRAESTRUTURA', 'CULTURA'])
  category!: string;

  @IsOptional()
  @IsString()
  frameworkRef?: string;

  @IsOptional()
  @IsEnum(ActionPlanPriority)
  priority?: ActionPlanPriority;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
