import { QuestionCategory, RiskImpact, RiskProbability } from '@prisma/client';
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

export class CreateRiskDto {
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

  @IsEnum(RiskProbability)
  probability!: RiskProbability;

  @IsEnum(RiskImpact)
  impact!: RiskImpact;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  treatment?: string;

  @IsOptional()
  @IsUUID('4')
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  assetCategory?: string;

  @IsOptional()
  @IsString()
  assetName?: string;

  @IsOptional()
  @IsString()
  threat?: string;

  @IsOptional()
  @IsString()
  vulnerability?: string;

  @IsOptional()
  @IsEnum(RiskProbability)
  inherentProbability?: RiskProbability;

  @IsOptional()
  @IsEnum(RiskImpact)
  inherentImpact?: RiskImpact;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  inherentScore?: number;

  @IsOptional()
  @IsString()
  existingControls?: string;

  @IsOptional()
  @IsString()
  proposedControls?: string;

  @IsOptional()
  @IsEnum(RiskProbability)
  residualProbability?: RiskProbability;

  @IsOptional()
  @IsEnum(RiskImpact)
  residualImpact?: RiskImpact;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  residualScore?: number;

  @IsOptional()
  @IsString()
  residualLevel?: string;
}
