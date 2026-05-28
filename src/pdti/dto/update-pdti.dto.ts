import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdatePdtiDto {
  @IsOptional()
  @IsString()
  title?: string;

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
