import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateQuestionTemplateOptionDto {
  @IsString()
  @MaxLength(500)
  label!: string;

  /** Normalized maturity option score (0–5). */
  @IsNumber()
  @Min(0)
  scoreValue!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
