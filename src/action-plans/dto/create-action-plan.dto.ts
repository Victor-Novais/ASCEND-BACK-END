import { ActionPlanPriority, QuestionCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateActionPlanDto {
  @Type(() => Number)
  @IsInt()
  assessmentId!: number;

  @Type(() => Number)
  @IsInt()
  companyId!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsEnum(QuestionCategory)
  category!: QuestionCategory;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  frameworkRef?: string;

  @IsOptional()
  @IsEnum(ActionPlanPriority)
  priority?: ActionPlanPriority;

  @IsOptional()
  @IsUUID('4')
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}
