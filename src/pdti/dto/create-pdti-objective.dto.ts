import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePdtiObjectiveDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
