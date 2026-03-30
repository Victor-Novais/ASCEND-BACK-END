import { QuestionCategory, ResponseType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @MaxLength(1000)
  text!: string;

  @IsEnum(QuestionCategory)
  category!: QuestionCategory;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weight!: number;

  @IsEnum(ResponseType)
  responseType!: ResponseType;

  @IsBoolean()
  evidenceRequired!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hint?: string;

  @IsUUID('4')
  createdById!: string;
}
