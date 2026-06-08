import { IsOptional, IsString } from 'class-validator';

export class CreatePdtiIndicatorDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  baseline?: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  currentValue?: string;

  @IsOptional()
  @IsString()
  frequency?: string;
}
