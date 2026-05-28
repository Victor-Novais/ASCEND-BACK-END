import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class FilterPdtiDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assessmentId?: number;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
