import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EvidenceFileItemDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(2048)
  fileUrl!: string;

  @IsInt()
  @Min(1)
  fileSize!: number;

  @IsString()
  @MaxLength(120)
  mimeType!: string;
}

export class AssessmentResponseItemDto {
  /** Legacy assessments (no questionnaire template). */
  @IsOptional()
  @IsInt()
  @Min(1)
  questionId?: number;

  /** Template-based assessments; mutually exclusive with questionId. */
  @IsOptional()
  @IsInt()
  @Min(1)
  questionTemplateId?: number;

  @IsString()
  @MaxLength(500)
  responseValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  evidence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceFileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceFileItemDto)
  @ArrayMaxSize(20)
  evidenceFiles?: EvidenceFileItemDto[];
}
