import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePdtiDto {
  @IsInt()
  companyId!: number;

  @IsOptional()
  @IsInt()
  assessmentId?: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  vision?: string;

  @IsOptional()
  @IsString()
  mission?: string;

  @IsOptional()
  @IsString()
  strategicGoals?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  values?: string;

  @IsOptional()
  @IsString()
  legalRequirements?: string;

  @IsOptional()
  @IsString()
  currentScenario?: string;

  @IsOptional()
  @IsString()
  desiredScenario?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  swotStrengths?: string;

  @IsOptional()
  @IsString()
  swotWeaknesses?: string;

  @IsOptional()
  @IsString()
  swotOpportunities?: string;

  @IsOptional()
  @IsString()
  swotThreats?: string;

  @IsOptional()
  @IsDateString()
  approvedAt?: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;
}
