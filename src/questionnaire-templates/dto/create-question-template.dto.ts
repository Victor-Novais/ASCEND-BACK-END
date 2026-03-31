import { QuestionCategory, ResponseType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateQuestionTemplateOptionDto } from './create-question-template-option.dto';

export class CreateQuestionTemplateDto {
  @IsString()
  @MaxLength(4000)
  text!: string;

  @IsEnum(QuestionCategory)
  category!: QuestionCategory;

  @IsNumber()
  @Min(0.01)
  weight!: number;

  @IsEnum(ResponseType)
  responseType!: ResponseType;

  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hint?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** When provided, scoring uses option scores (0–5) instead of raw YES_NO / SCALE parsing. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionTemplateOptionDto)
  @ArrayMaxSize(50)
  options?: CreateQuestionTemplateOptionDto[];
}
