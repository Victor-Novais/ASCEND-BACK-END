import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePdtiDto {
  @IsInt()
  companyId: number;

  @IsOptional()
  @IsInt()
  assessmentId?: number;

  @IsString()
  title: string;

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
}
